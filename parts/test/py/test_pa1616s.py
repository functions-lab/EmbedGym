"""Unit tests for embedgym_parts/pa1616s.py's PA1616SModel: each case calls `emit_cycle` /
`handle_command` directly with the module time PA1616SModule would pass; the
module's timing is in test_registry.py."""
import re

import pytest

from embedgym_parts.pa1616s import BYTE_NS, GPS_BAUD, PA1616SModel


def lines(data: bytes) -> list[str]:
    return [l for l in data.decode('ascii').split('\r\n') if l]


def checksum_ok(line: str) -> bool:
    m = re.fullmatch(r'\$(.*)\*([0-9A-F]{2})', line)
    if not m:
        return False
    cs = 0
    for ch in m.group(1):
        cs ^= ord(ch)
    return cs == int(m.group(2), 16)


def send(model: PA1616SModel, line: str) -> list[str]:
    return lines(model.handle_command(line))


class TestNmeaOutput:
    def test_default_sentence_set_with_valid_checksums_no_fix(self):
        out = lines(PA1616SModel().emit_cycle(1000))
        assert [l[:6] for l in out] == ['$GPGGA', '$GPGSA', '$GPGSV', '$GPRMC', '$GPVTG']
        for l in out:
            assert checksum_ok(l), l
        assert re.match(r'^\$GPGGA,\d{6}\.\d{3},,,,,0,00,', out[0])
        assert ',V,' in out[3]

    def test_position_after_fix_and_lat_lon_are_driven(self):
        model = PA1616SModel()
        model.update({'fix': True, 'latitude': 37.7749, 'longitude': -122.4194})
        out = lines(model.emit_cycle(1000))
        gga = next(l for l in out if l.startswith('$GPGGA'))
        rmc = next(l for l in out if l.startswith('$GPRMC'))
        assert '3746.4940,N,12225.1640,W,1,08,' in gga
        assert ',A,3746.4940,N,12225.1640,W,' in rmc
        assert ',010126,' in rmc

    def test_task_position_formats_as_the_shared_rows_assert(self):
        model = PA1616SModel(fix=True, latitude=40.7128, longitude=-74.006)
        gga = lines(model.emit_cycle(3000))[0]
        assert re.match(r'^\$GPGGA,\d{6}\.\d{3},4042\.7680,N,07400\.3600,W,1,', gga)

    def test_nmea_clock_follows_module_time(self):
        model = PA1616SModel()
        times = [lines(model.emit_cycle(ms))[0].split(',')[1] for ms in (1000, 2000)]
        assert times == ['120001.000', '120002.000']

    def test_southern_eastern_hemispheres(self):
        model = PA1616SModel(fix=True, latitude=-33.8688, longitude=151.2093)
        gga = lines(model.emit_cycle(1000))[0]
        assert '3352.1280,S,15112.5580,E' in gga

    def test_symbol_time_is_ten_bits_at_9600(self):
        assert GPS_BAUD == 9600
        assert BYTE_NS == 1_041_667


class TestPmtkCommands:
    def test_pmtk314_rmcgga_restricts_output_and_acks(self):
        model = PA1616SModel()
        assert send(model, '$PMTK314,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0*28') == ['$PMTK001,314,3*36']
        assert [l[:6] for l in lines(model.emit_cycle(1000))] == ['$GPGGA', '$GPRMC']

    def test_pmtk314_minus_one_restores_the_default_set(self):
        model = PA1616SModel()
        send(model, '$PMTK314,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0*28')
        send(model, '$PMTK314,-1*04')
        assert len(lines(model.emit_cycle(1000))) == 5

    def test_pmtk314_divisor_skips_cycles(self):
        model = PA1616SModel()
        send(model, '$PMTK314,0,1,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0*2B')
        assert [l[:6] for l in lines(model.emit_cycle(1000))] == ['$GPRMC']
        assert [l[:6] for l in lines(model.emit_cycle(2000))] == ['$GPGGA', '$GPRMC']

    def test_pmtk220_changes_the_update_interval(self):
        model = PA1616SModel()
        assert send(model, '$PMTK220,200*2C') == ['$PMTK001,220,3*30']
        assert model.interval_ms == 200
        with pytest.raises(ValueError, match='out of range'):
            send(model, '$PMTK220,50*1B')

    def test_pmtk605_answers_with_the_firmware_release(self):
        reply = send(PA1616SModel(), '$PMTK605*31')
        assert reply[0].startswith('$PMTK705')
        assert checksum_ok(reply[0])

    def test_pgcmd_33_1_enables_the_antenna_advisory(self):
        model = PA1616SModel()
        assert send(model, '$PGCMD,33,1*6C') == ['$PGACK,33,1*6F']
        top = next(l for l in lines(model.emit_cycle(1000)) if l.startswith('$PGTOP'))
        assert checksum_ok(top)

    def test_pmtk251_9600_acks_other_bauds_raise(self):
        model = PA1616SModel()
        assert send(model, '$PMTK251,9600*17') == ['$PMTK001,251,3*36']
        with pytest.raises(ValueError, match='baud'):
            send(model, '$PMTK251,38400*27')

    def test_unknown_commands_and_bad_checksums_raise(self):
        model = PA1616SModel()
        with pytest.raises(ValueError, match='unsupported'):
            send(model, '$PMTK999,1*26')
        with pytest.raises(ValueError, match='checksum'):
            send(model, '$PMTK220,1000*FF')
        with pytest.raises(ValueError, match='non-NMEA'):
            send(model, 'hello')

    def test_unknown_sensor_properties_raise(self):
        with pytest.raises(ValueError, match='unknown property'):
            PA1616SModel().update({'bogus': 1})
        with pytest.raises(ValueError, match='finite number'):
            PA1616SModel().update({'latitude': 'north'})
