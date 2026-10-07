const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'midi.db');
const db = new sqlite3.Database(dbPath);

const cols = ['applicant_name', 'applicant_surname', 'omang_passport', 'salary', 'insurance'];
db.serialize(() => {
    cols.forEach(col => {
        db.run(`ALTER TABLE quotations ADD COLUMN ${col} TEXT`, (err) => {
            if (err) console.log(err.message);
            else console.log('Added ' + col);
        });
    });
});
setTimeout(() => db.close(), 1000);
