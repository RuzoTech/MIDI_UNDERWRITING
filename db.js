const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'midi.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        name TEXT,
        password TEXT,
        role TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS quotations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        serial_number TEXT UNIQUE,
        date TEXT,
        time TEXT,
        generated_by TEXT,
        loan_amount REAL,
        term INTEGER,
        interest_rate REAL,
        funeral_policy_selection TEXT,
        admin_fee REAL,
        loyalty REAL,
        net_admin_fee REAL,
        adjusted_loan_amount REAL,
        installment REAL,
        collection_fee REAL,
        funeral_policy_amount REAL,
        total_monthly_installment REAL,
        total_collectible REAL,
        applicant_name TEXT,
        applicant_surname TEXT,
        omang_passport TEXT,
        salary REAL,
        insurance REAL
    )`);

    // Create super admin if not exists
    db.get('SELECT * FROM users WHERE username = ?', ['Leruo'], (err, row) => {
        if (!row) {
            const hash = bcrypt.hashSync('BDManager1', 10);
            db.run('INSERT INTO users (username, name, password, role) VALUES (?, ?, ?, ?)', ['Leruo', 'Leruo Super Admin', hash, 'SUPER ADMIN']);
        }
    });
});

module.exports = db;