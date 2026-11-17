#!/usr/bin/env python3
"""Exec a command that gets SIGINT when PARENT_PID exits: macOS stand-in for Linux's PR_SET_PDEATHSIG.

    python3 eval/sigint_on_parent_exit.py PARENT_PID COMMAND [ARG...]

The command replaces this process, so it keeps this pid. A forked watcher waits
on kqueue for PARENT_PID or the command to exit; the command starts only once
the watcher watches PARENT_PID and PARENT_PID is still this process's parent.
"""

import os
import select
import signal
import sys
import traceback


def watch(parent_pid: int, target_pid: int, ready_fd: int) -> None:
    # The command's own interrupts must not kill its watcher.
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    kq = select.kqueue()
    for pid in (target_pid, parent_pid):
        kq.control([select.kevent(pid, select.KQ_FILTER_PROC, select.KQ_EV_ADD, select.KQ_NOTE_EXIT)], 0)
    os.write(ready_fd, b"1")
    os.close(ready_fd)
    exited = {event.ident for event in kq.control(None, 2)}
    if target_pid not in exited:
        os.kill(target_pid, signal.SIGINT)
    os._exit(0)


def main() -> None:
    parent_pid = int(sys.argv[1])
    command = sys.argv[2:]
    # A scheduler started in the background inherits SIGINT ignored; Python
    # children then never raise KeyboardInterrupt.
    signal.signal(signal.SIGINT, signal.SIG_DFL)
    target_pid = os.getpid()
    ready_read, ready_write = os.pipe()
    if os.fork() == 0:
        # The watcher must never return into main() and exec the command too.
        try:
            os.close(ready_read)
            watch(parent_pid, target_pid, ready_write)
        except BaseException:
            traceback.print_exc()
        os._exit(1)
    os.close(ready_write)
    ready = os.read(ready_read, 1)
    os.close(ready_read)
    if ready != b"1":
        raise SystemExit(f"watcher of parent {parent_pid} failed to start")
    if os.getppid() != parent_pid:
        raise SystemExit(f"parent {parent_pid} exited before {command[0]} started")
    os.execv(command[0], command)


if __name__ == "__main__":
    main()
