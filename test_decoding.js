
const fs = require('fs');

// Mock browser APIs
class TextDecoder {
    decode(uint8Array) {
        return Buffer.from(uint8Array).toString('utf-8');
    }
}
global.TextDecoder = TextDecoder;

global.atob = (str) => Buffer.from(str, 'base64').toString('binary');

// Read the CSV
const csvContent = fs.readFileSync('/tmp/file_attachments/score_summary_table_user-23.csv', 'utf8');

// Simulate Shortcuts Base64 Encoding (UTF-8 bytes -> Base64)
const base64Encoded = Buffer.from(csvContent, 'utf8').toString('base64');

console.log(`Original size: ${csvContent.length}`);
console.log(`Base64 size: ${base64Encoded.length}`);

// Decode logic for App.jsx
try {
    const binaryString = atob(base64Encoded);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const decoded = new TextDecoder().decode(bytes);

    if (decoded === csvContent) {
        console.log("Decoding successful! Content matches.");
    } else {
        console.log("Decoding failed. Content mismatch.");
        // console.log("Decoded sample:", decoded.substring(0, 100));
    }
} catch (e) {
    console.error("Error decoding:", e);
}
