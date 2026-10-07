const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'midi.db');
const db = new sqlite3.Database(dbPath);

// SQLite doesn't support ALTER COLUMN, so we patch values:
// Re-cast insurance (TEXT→REAL) by updating all rows
db.serialize(() => {
    db.run(`UPDATE quotations SET insurance = CAST(insurance AS REAL) WHERE insurance IS NOT NULL`, (err) => {
        if (err) console.log('insurance cast err:', err.message);
        else console.log('insurance column values re-cast to REAL');
    });
    db.run(`UPDATE quotations SET salary = CAST(salary AS REAL) WHERE salary IS NOT NULL`, (err) => {
        if (err) console.log('salary cast err:', err.message);
        else console.log('salary column values re-cast to REAL');
    });
});
setTimeout(() => db.close(), 1000);
