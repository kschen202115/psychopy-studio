const encoder = new TextEncoder();

function bytesFor(content) {
    if (content instanceof Uint8Array) return content;
    if (content instanceof ArrayBuffer) return new Uint8Array(content);
    if (ArrayBuffer.isView(content)) return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
    return encoder.encode(String(content ?? ""));
}

function dosDateTime(date = new Date()) {
    const year = Math.max(date.getFullYear(), 1980);
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { dosDate, dosTime };
}

function makeCrcTable() {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
    }
    return table;
}

const crcTable = makeCrcTable();

function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(output, value) {
    output.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(output, value) {
    output.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function writeBytes(output, bytes) {
    for (const byte of bytes) output.push(byte);
}

/**
 * Build a small ZIP archive using store/no-compression entries.
 *
 * The browser export layer only needs deterministic packaging of official
 * compiler outputs, so this keeps ZIP creation dependency-free and semantics
 * neutral.
 */
export function createZip(entries) {
    const output = [];
    const centralDirectory = [];
    const { dosDate, dosTime } = dosDateTime();
    let offset = 0;

    for (const entry of entries) {
        const name = String(entry.name || "").replaceAll("\\", "/").replace(/^\/+/, "");
        if (!name) continue;
        const nameBytes = encoder.encode(name);
        const data = bytesFor(entry.content);
        const crc = crc32(data);
        const localOffset = offset;

        // Local file header
        writeUint32(output, 0x04034b50);
        writeUint16(output, 20); // version needed
        writeUint16(output, 0x0800); // UTF-8 names
        writeUint16(output, 0); // store/no compression
        writeUint16(output, dosTime);
        writeUint16(output, dosDate);
        writeUint32(output, crc);
        writeUint32(output, data.length);
        writeUint32(output, data.length);
        writeUint16(output, nameBytes.length);
        writeUint16(output, 0); // extra length
        writeBytes(output, nameBytes);
        writeBytes(output, data);
        offset = output.length;

        const central = [];
        writeUint32(central, 0x02014b50);
        writeUint16(central, 20); // version made by
        writeUint16(central, 20); // version needed
        writeUint16(central, 0x0800); // UTF-8 names
        writeUint16(central, 0); // store/no compression
        writeUint16(central, dosTime);
        writeUint16(central, dosDate);
        writeUint32(central, crc);
        writeUint32(central, data.length);
        writeUint32(central, data.length);
        writeUint16(central, nameBytes.length);
        writeUint16(central, 0); // extra length
        writeUint16(central, 0); // comment length
        writeUint16(central, 0); // disk number
        writeUint16(central, 0); // internal attrs
        writeUint32(central, 0); // external attrs
        writeUint32(central, localOffset);
        writeBytes(central, nameBytes);
        centralDirectory.push(central);
    }

    const centralOffset = output.length;
    for (const central of centralDirectory) writeBytes(output, central);
    const centralSize = output.length - centralOffset;

    // End of central directory
    writeUint32(output, 0x06054b50);
    writeUint16(output, 0); // disk number
    writeUint16(output, 0); // central dir disk
    writeUint16(output, centralDirectory.length);
    writeUint16(output, centralDirectory.length);
    writeUint32(output, centralSize);
    writeUint32(output, centralOffset);
    writeUint16(output, 0); // comment length

    return new Blob([new Uint8Array(output)], { type: "application/zip" });
}
