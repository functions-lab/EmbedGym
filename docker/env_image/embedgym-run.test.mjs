import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('embedgym-run preserves its banner and forwards the requested duration, artifact and actions', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'embedgym-run-test-'));
  try {
    writeFileSync(path.join(dir, 'curl'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o755 });
    const artifact = path.join(dir, 'firmware with spaces.bin');
    writeFileSync(artifact, 'firmware');
    const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`,
      EMBEDGYM_SIM_URL: 'http://sim:8080', EMBEDGYM_TASK: 'blink_led_1hz',
      EMBEDGYM_TARGET: 'esp32s3_espidf', EMBEDGYM_ARTIFACT: artifact, EMBEDGYM_RUN_ID: 'run-1', EMBEDGYM_ACTIONS: '1' };
    const embedgymRun = fileURLToPath(new URL('./embedgym-run', import.meta.url));
    const run = (...args) => spawnSync('sh', [embedgymRun, ...args], { env, encoding: 'utf8' });
    const { max_ms } = JSON.parse(readFileSync(new URL('../../harness/serial_config.json', import.meta.url), 'utf8'));
    for (const args of [[], ['--ms', '15000'], ['--ms', String(max_ms)]]) {
      const result = run(...args);
      assert.equal(result.status, 0, result.stderr);
      const lines = result.stdout.trimEnd().split('\n');
      assert.equal(lines[0], '=== embedgym-run: simulator output ===');
      assert.ok(lines.includes(`@${artifact}`));
      assert.ok(lines.includes('X-EmbedGym-Run-Id: run-1'));
      assert.equal(lines.includes(`X-EmbedGym-Run-Ms: ${args[1]}`), args.length > 0);
      assert.ok(!result.stdout.includes('X-EmbedGym-Actions'));
    }
    for (const args of [['--ms'], ['--ms', '0'], ['--ms', '-1'], ['--ms', '1.5'], ['--ms', 'abc'], ['--bad'], ['--ms', '10', 'extra']]) {
      const result = run(...args);
      assert.equal(result.status, 2);
      assert.ok(!result.stdout.includes('http://sim:8080'));
    }

    for (const ms of [String(max_ms + 1), '99999999999999999999']) {
      const overCap = run('--ms', ms);
      assert.equal(overCap.status, 2);
      assert.equal(overCap.stderr, `--ms must be at most ${max_ms}\n`);
      assert.ok(!overCap.stdout.includes('http://sim:8080'));
    }

    const script = '500 set DHT1.temperature = 28\n' + '1000 read LCD1.row0\n'.repeat(1000);
    const withScript = spawnSync('sh', [embedgymRun], { env, encoding: 'utf8', input: script });
    assert.equal(withScript.status, 0, withScript.stderr);
    assert.ok(withScript.stdout.split('\n').includes(`X-EmbedGym-Actions: ${Buffer.from(script.trimEnd()).toString('base64')}`));

    const serialOnly = spawnSync('sh', [embedgymRun], { env: { ...env, EMBEDGYM_ACTIONS: '0' }, encoding: 'utf8', input: script });
    assert.equal(serialOnly.status, 0, serialOnly.stderr);
    assert.ok(!serialOnly.stdout.includes('X-EmbedGym-Actions'));

    const badSwitch = spawnSync('sh', [embedgymRun], { env: { ...env, EMBEDGYM_ACTIONS: 'yes' }, encoding: 'utf8' });
    assert.equal(badSwitch.status, 2);
    assert.ok(!badSwitch.stdout.includes('http://sim:8080'));

    const tooLong = spawnSync('sh', [embedgymRun], { env, encoding: 'utf8', input: 'x'.repeat(32769) });
    assert.equal(tooLong.status, 2);
    assert.equal(tooLong.stderr, 'embedgym-run: actions are 32769 bytes; the limit is 32768\n');
    assert.ok(!tooLong.stdout.includes('http://sim:8080'));

    const failedBody = 'Output (1 lines):\n[0 ms] ERROR: printed by firmware\nERROR: line 1: unknown part BTN9\n';
    writeFileSync(path.join(dir, 'curl'), `#!/bin/sh\nprintf '%s' '${failedBody}'\n`, { mode: 0o755 });
    const failed = run();
    assert.equal(failed.status, 1);
    assert.equal(failed.stdout, `=== embedgym-run: simulator output ===\n${failedBody}`);

    const firmwareError = 'Output (1 lines, 5000 simulated ms):\n[0 ms] ERROR: printed by firmware\n[5000 ms] end of run\n';
    writeFileSync(path.join(dir, 'curl'), `#!/bin/sh\nprintf '%s' '${firmwareError}'\n`, { mode: 0o755 });
    assert.equal(run().status, 0);

    writeFileSync(path.join(dir, 'curl'), '#!/bin/sh\necho "bad X-EmbedGym-Run-Id"\nexit 22\n', { mode: 0o755 });
    const requestError = run();
    assert.equal(requestError.status, 22);
    assert.equal(requestError.stdout, '=== embedgym-run: simulator output ===\nbad X-EmbedGym-Run-Id\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
