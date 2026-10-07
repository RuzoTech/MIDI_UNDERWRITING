const XLSX = require('xlsx');

const workbook = XLSX.readFile('BOPRITU (9) (1).xlsx', { cellFormula: true });
const sheetName = workbook.SheetNames[0]; // Assume first sheet
const worksheet = workbook.Sheets[sheetName];

console.log("Sheet Name:", sheetName);

// Let's dump some cell values to understand the layout
for (let r = 1; r <= 30; r++) {
    let row = [];
    for (let c = 0; c < 15; c++) {
        let cellAddress = XLSX.utils.encode_cell({r: r-1, c: c});
        let cell = worksheet[cellAddress];
        if (cell) {
            row.push(cellAddress + ": " + cell.v + (cell.f ? " [Formula: " + cell.f + "]" : ""));
        }
    }
    if (row.length > 0) {
        console.log("Row " + r + ":", row.join(" | "));
    }
}
