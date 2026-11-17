"""Merge the core's loader ELF and a packaged sketch (*-zsk.bin) into one ELF.

The result has every PT_LOAD of the loader that carries file data, plus one
PT_LOAD holding the sketch at the sketch partition address, so a single
LoadELF puts both in flash.

usage: merge_elf.py <loader.elf> <sketch-zsk.bin> <address> <out.elf>
"""
import struct
import sys

PT_LOAD = 1
EHDR = struct.Struct('<16sHHIIIIIHHHHHH')
PHDR = struct.Struct('<IIIIIIII')


def load_segments(path):
    data = open(path, 'rb').read()
    ident, e_type, machine, version, entry, phoff, shoff, flags, ehsize, phentsize, phnum, *_ = EHDR.unpack_from(data)
    if ident[:4] != b'\x7fELF' or ident[4] != 1 or ident[5] != 1:
        raise ValueError(f'{path}: not a little-endian ELF32')
    segments = []
    for i in range(phnum):
        p_type, offset, vaddr, paddr, filesz, memsz, p_flags, align = PHDR.unpack_from(data, phoff + i * phentsize)
        if p_type == PT_LOAD and filesz:
            segments.append((vaddr, paddr, p_flags, data[offset:offset + filesz]))
    return ident, machine, version, entry, flags, segments


def main():
    loader, sketch, address, out = sys.argv[1], sys.argv[2], int(sys.argv[3], 0), sys.argv[4]
    ident, machine, version, entry, flags, segments = load_segments(loader)
    blob = open(sketch, 'rb').read()
    for vaddr, paddr, _, payload in segments:
        if paddr < address + len(blob) and address < paddr + len(payload):
            raise ValueError(f'loader segment at {paddr:#x} overlaps the sketch at {address:#x}')
    segments.append((address, address, 5, blob))  # R+X

    phoff = EHDR.size
    offset = phoff + PHDR.size * len(segments)
    headers, body = b'', b''
    for vaddr, paddr, p_flags, payload in segments:
        pad = (-offset) % 4
        body += b'\0' * pad
        offset += pad
        headers += PHDR.pack(PT_LOAD, offset, vaddr, paddr, len(payload), len(payload), p_flags, 4)
        body += payload
        offset += len(payload)
    ehdr = EHDR.pack(ident, 2, machine, version, entry, phoff, 0, flags, EHDR.size, PHDR.size, len(segments), 0, 0, 0)
    open(out, 'wb').write(ehdr + headers + body)


if __name__ == '__main__':
    main()
