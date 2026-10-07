const fs = require('fs');
const path = require('path');

const files = {
    'db.js': `
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'midi.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(\`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        name TEXT,
        password TEXT,
        role TEXT
    )\`);

    db.run(\`CREATE TABLE IF NOT EXISTS quotations (
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
        total_collectible REAL
    )\`);

    // Create super admin if not exists
    db.get('SELECT * FROM users WHERE username = ?', ['Leruo'], (err, row) => {
        if (!row) {
            const hash = bcrypt.hashSync('BDManager1', 10);
            db.run('INSERT INTO users (username, name, password, role) VALUES (?, ?, ?, ?)', ['Leruo', 'Leruo Super Admin', hash, 'SUPER ADMIN']);
        }
    });
});

module.exports = db;
`,
    'server.js': `
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./db');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const app = express();
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'midi_secret_key_123',
    resave: false,
    saveUninitialized: false
}));

// Middleware to check auth
function isAuthenticated(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

function hasRole(roles) {
    return function(req, res, next) {
        if (req.session.user && roles.includes(req.session.user.role)) {
            next();
        } else {
            res.status(403).send('Forbidden');
        }
    }
}

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

app.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/calculator');
    } else {
        res.redirect('/login');
    }
});

app.get('/login', (req, res) => res.render('login', { error: null }));

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (user && bcrypt.compareSync(password, user.password)) {
            req.session.user = { id: user.id, username: user.username, name: user.name, role: user.role };
            res.redirect('/calculator');
        } else {
            res.render('login', { error: 'Invalid credentials' });
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

app.get('/calculator', isAuthenticated, (req, res) => {
    res.render('calculator');
});

// Calculation logic matching exactly the provided formulas
function calculateQuotation(loanAmount, term, includeFuneralPolicy) {
    const adminFee = loanAmount * 0.03;
    const loyalty = 25;
    const netAdminFee = adminFee - loyalty;
    const adjustedLoanAmount = loanAmount + adminFee;
    
    let interestRate;
    switch(term) {
        case 3: interestRate = 0.125; break;
        case 6: interestRate = 0.060; break;
        case 12: interestRate = 0.060; break;
        case 18: interestRate = 0.045; break;
        case 24: interestRate = 0.040; break;
        case 36: interestRate = 0.0275; break;
        case 48: interestRate = 0.0207; break;
        default: throw new Error("Invalid term");
    }
    
    const installment = (((interestRate * adjustedLoanAmount * term) + adjustedLoanAmount) / term);
    const collectionFee = (0.015 * adjustedLoanAmount) / term;
    const funeralPolicyAmount = includeFuneralPolicy ? 12 : 0;
    
    const totalMonthlyInstallment = installment + collectionFee + funeralPolicyAmount;
    const totalCollectible = totalMonthlyInstallment * term;
    
    return {
        loanAmount,
        term,
        interestRate,
        includeFuneralPolicy,
        adminFee,
        loyalty,
        netAdminFee,
        adjustedLoanAmount,
        installment,
        collectionFee,
        funeralPolicyAmount,
        totalMonthlyInstallment,
        totalCollectible
    };
}

function generateSerialNumber() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

app.post('/generate-quote', isAuthenticated, (req, res) => {
    const loanAmount = parseFloat(req.body.loanAmount);
    const term = parseInt(req.body.term);
    const includeFuneralPolicy = req.body.funeralPolicy === 'Yes';
    
    if (loanAmount < 4000 || loanAmount > 50000) return res.status(400).send("Invalid loan amount. Min 4000, Max 50000.");
    
    let allowedTerms = [];
    if (loanAmount <= 5000) allowedTerms = [3, 6];
    else if (loanAmount <= 10000) allowedTerms = [3, 6, 12];
    else if (loanAmount <= 15000) allowedTerms = [3, 6, 12, 18];
    else if (loanAmount <= 20000) allowedTerms = [3, 6, 12, 18, 24];
    else if (loanAmount <= 40000) allowedTerms = [3, 6, 12, 18, 24, 36];
    else if (loanAmount <= 50000) allowedTerms = [3, 6, 12, 18, 24, 36, 48];
    
    if (!allowedTerms.includes(term)) return res.status(400).send("Invalid term for loan amount.");
    
    const calc = calculateQuotation(loanAmount, term, includeFuneralPolicy);
    
    let serialNumber = generateSerialNumber();
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB');
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    
    db.run(\`INSERT INTO quotations 
        (serial_number, date, time, generated_by, loan_amount, term, interest_rate, funeral_policy_selection, admin_fee, loyalty, net_admin_fee, adjusted_loan_amount, installment, collection_fee, funeral_policy_amount, total_monthly_installment, total_collectible) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)\`,
        [serialNumber, dateStr, timeStr, req.session.user.username, calc.loanAmount, calc.term, calc.interestRate, calc.includeFuneralPolicy ? 'Yes' : 'No', calc.adminFee, calc.loyalty, calc.netAdminFee, calc.adjustedLoanAmount, calc.installment, calc.collectionFee, calc.funeralPolicyAmount, calc.totalMonthlyInstallment, calc.totalCollectible],
        function(err) {
            if (err) return res.status(500).send("Error saving quote");
            res.redirect('/quotations/' + serialNumber);
        }
    );
});

app.get('/quotations', isAuthenticated, (req, res) => {
    let query = 'SELECT * FROM quotations ORDER BY id DESC';
    let params = [];
    
    if (req.session.user.role === 'LOAN OFFICER') {
        query = 'SELECT * FROM quotations WHERE generated_by = ? ORDER BY id DESC';
        params = [req.session.user.username];
    }
    
    db.all(query, params, (err, rows) => {
        res.render('quotations', { quotations: rows });
    });
});

app.get('/quotations/:serial', isAuthenticated, (req, res) => {
    db.get('SELECT * FROM quotations WHERE serial_number = ?', [req.params.serial], (err, row) => {
        if (!row) return res.status(404).send("Not found");
        res.render('quotation_detail', { quote: row });
    });
});

app.get('/quotations/:serial/download', isAuthenticated, (req, res) => {
    db.get('SELECT * FROM quotations WHERE serial_number = ?', [req.params.serial], (err, row) => {
        if (!row) return res.status(404).send("Not found");
        
        const doc = new PDFDocument({ margin: 50 });
        let filename = 'Quotation_' + row.serial_number + '.pdf';
        res.setHeader('Content-disposition', 'attachment; filename="' + filename + '"');
        res.setHeader('Content-type', 'application/pdf');
        
        doc.pipe(res);
        
        doc.fontSize(24).font('Helvetica-Bold').text('MIDI', { align: 'center' });
        doc.moveDown();
        doc.fontSize(16).text('LOAN QUOTATION', { align: 'center' });
        doc.moveDown(2);
        
        doc.fontSize(12).font('Helvetica');
        doc.text('Quotation Number: ' + row.serial_number);
        doc.text('Date: ' + row.date);
        doc.text('Time: ' + row.time);
        doc.moveDown(2);
        
        doc.text('Loan Amount: P' + row.loan_amount.toFixed(2));
        doc.text('Loan Term: ' + row.term + ' months');
        doc.text('Interest Rate: ' + (row.interest_rate * 100).toFixed(2) + '%');
        doc.text('Funeral Policy: ' + row.funeral_policy_selection);
        doc.moveDown();
        doc.font('Helvetica-Bold').text('Monthly Payment: P' + row.total_monthly_installment.toFixed(2));
        doc.text('Total Collectible: P' + row.total_collectible.toFixed(2));
        
        doc.moveDown(4);
        doc.font('Helvetica-Oblique').fontSize(10).text('This quotation is subject to final approval and terms and conditions. The figures provided are illustrative.', { align: 'center' });
        
        doc.end();
    });
});

app.get('/users', hasRole(['SUPER ADMIN', 'ADMIN']), (req, res) => {
    db.all('SELECT * FROM users', [], (err, rows) => {
        res.render('users', { users: rows });
    });
});

app.post('/users/add', hasRole(['SUPER ADMIN', 'ADMIN']), (req, res) => {
    const { username, name, password, role } = req.body;
    const hash = bcrypt.hashSync(password, 10);
    db.run('INSERT INTO users (username, name, password, role) VALUES (?, ?, ?, ?)', [username, name, hash, role], (err) => {
        res.redirect('/users');
    });
});

app.get('/users/delete/:id', hasRole(['SUPER ADMIN', 'ADMIN']), (req, res) => {
    db.get('SELECT * FROM users WHERE id = ?', [req.params.id], (err, targetUser) => {
        if (!targetUser) return res.redirect('/users');
        if (targetUser.role === 'SUPER ADMIN') return res.status(403).send("Cannot delete Super Admin");
        if (req.session.user.role === 'ADMIN' && targetUser.role === 'SUPER ADMIN') return res.status(403).send("Admin cannot delete Super Admin");
        
        db.run('DELETE FROM users WHERE id = ?', [req.params.id], (err) => {
            res.redirect('/users');
        });
    });
});

app.get('/profile', isAuthenticated, (req, res) => {
    db.get('SELECT * FROM users WHERE id = ?', [req.session.user.id], (err, row) => {
        res.render('profile', { profileUser: row, error: null, success: null });
    });
});

app.post('/profile', isAuthenticated, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    db.get('SELECT * FROM users WHERE id = ?', [req.session.user.id], (err, row) => {
        if (bcrypt.compareSync(currentPassword, row.password)) {
            const hash = bcrypt.hashSync(newPassword, 10);
            db.run('UPDATE users SET password = ? WHERE id = ?', [hash, req.session.user.id], (err) => {
                res.render('profile', { profileUser: row, error: null, success: 'Password updated successfully' });
            });
        } else {
            res.render('profile', { profileUser: row, error: 'Incorrect current password', success: null });
        }
    });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
`,
    'views/layout.ejs': `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MIDI Loan Quotation System</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; color: #333; }
        header { background-color: #000; color: #fff; padding: 10px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #d4af37; }
        header h1 { margin: 0; font-size: 20px; }
        nav a { color: #fff; text-decoration: none; margin-left: 15px; }
        nav a:hover { color: #d4af37; }
        .container { max-width: 1000px; margin: 20px auto; padding: 20px; background-color: #fff; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        h2 { border-bottom: 2px solid #d4af37; padding-bottom: 5px; }
        .form-group { margin-bottom: 15px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
        input[type="text"], input[type="number"], input[type="password"], select { width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
        button { background-color: #000; color: #d4af37; border: none; padding: 10px 20px; cursor: pointer; font-size: 16px; border-radius: 4px; }
        button:hover { background-color: #333; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #000; color: #d4af37; }
        .error { color: red; margin-bottom: 10px; }
        .success { color: green; margin-bottom: 10px; }
        .brand-text { color: #d4af37; }
    </style>
</head>
<body>
    <% if (user) { %>
    <header>
        <h1><span class="brand-text">MIDI</span> Underwriting Engine</h1>
        <nav>
            <a href="/calculator">Calculator</a>
            <a href="/quotations">Quotations</a>
            <a href="/profile">Profile</a>
            <% if (user.role === 'SUPER ADMIN' || user.role === 'ADMIN') { %>
                <a href="/users">User Management</a>
            <% } %>
            <a href="/logout">Logout</a>
        </nav>
    </header>
    <% } %>
    <div class="container">
        <%- body %>
    </div>
</body>
</html>
`,
    'views/login.ejs': `
<%- include('layout', { body: \`
    <div style="max-width: 400px; margin: 0 auto; text-align: center;">
        <h1 style="color: #000;"><span class="brand-text">MIDI</span> Sign In</h1>
        <% if (error) { %><div class="error"><%= error %></div><% } %>
        <form method="POST" action="/login">
            <div class="form-group">
                <input type="text" name="username" placeholder="Username" required>
            </div>
            <div class="form-group">
                <input type="password" name="password" placeholder="Password" required>
            </div>
            <button type="submit" style="width: 100%;">Sign In</button>
        </form>
    </div>
\` }) %>
`,
    'views/calculator.ejs': `
<%- include('layout', { body: \`
    <h2>Loan Calculator</h2>
    <form method="POST" action="/generate-quote">
        <div class="form-group">
            <label>How much would you like to borrow? (P)</label>
            <input type="number" id="loanAmount" name="loanAmount" min="4000" max="50000" step="1" required onchange="updateTerms()">
        </div>
        <div class="form-group">
            <label>Loan Term</label>
            <select id="term" name="term" required>
                <!-- Options populated dynamically -->
            </select>
        </div>
        <div class="form-group">
            <label>Funeral Policy</label>
            <label style="font-weight: normal;"><input type="radio" name="funeralPolicy" value="Yes" checked> Yes</label>
            <label style="font-weight: normal;"><input type="radio" name="funeralPolicy" value="No"> No</label>
        </div>
        <button type="submit">Generate Quote</button>
    </form>
    
    <script>
    function updateTerms() {
        const amt = parseFloat(document.getElementById('loanAmount').value);
        const termSelect = document.getElementById('term');
        termSelect.innerHTML = '';
        if (isNaN(amt)) return;
        
        let terms = [];
        if (amt <= 5000) terms = [3, 6];
        else if (amt <= 10000) terms = [3, 6, 12];
        else if (amt <= 15000) terms = [3, 6, 12, 18];
        else if (amt <= 20000) terms = [3, 6, 12, 18, 24];
        else if (amt <= 40000) terms = [3, 6, 12, 18, 24, 36];
        else if (amt <= 50000) terms = [3, 6, 12, 18, 24, 36, 48];
        
        terms.forEach(t => {
            let opt = document.createElement('option');
            opt.value = t;
            opt.innerHTML = t + ' months';
            termSelect.appendChild(opt);
        });
    }
    // init on load
    updateTerms();
    </script>
\` }) %>
`,
    'views/quotation_detail.ejs': `
<%- include('layout', { body: \`
    <h2>Quotation Generated</h2>
    <p><strong>Serial Number:</strong> <%= quote.serial_number %></p>
    <p><strong>Date:</strong> <%= quote.date %> <%= quote.time %></p>
    <hr>
    <p><strong>Loan Amount:</strong> P<%= quote.loan_amount.toFixed(2) %></p>
    <p><strong>Term:</strong> <%= quote.term %> months</p>
    <p><strong>Interest Rate:</strong> <%= (quote.interest_rate * 100).toFixed(2) %>%</p>
    <p><strong>Funeral Policy:</strong> <%= quote.funeral_policy_selection %></p>
    <p><strong>Monthly Payment:</strong> P<%= quote.total_monthly_installment.toFixed(2) %></p>
    <p><strong>Total Collectible:</strong> P<%= quote.total_collectible.toFixed(2) %></p>
    <br>
    <a href="/quotations/<%= quote.serial_number %>/download"><button>Download PDF</button></a>
\` }) %>
`,
    'views/quotations.ejs': `
<%- include('layout', { body: \`
    <h2>Loan Quotations</h2>
    <table>
        <thead>
            <tr>
                <th>Serial</th>
                <th>Date</th>
                <th>User</th>
                <th>Amount</th>
                <th>Term</th>
                <th>Monthly</th>
                <th>Action</th>
            </tr>
        </thead>
        <tbody>
            <% quotations.forEach(q => { %>
                <tr>
                    <td><%= q.serial_number %></td>
                    <td><%= q.date %></td>
                    <td><%= q.generated_by %></td>
                    <td>P<%= q.loan_amount.toFixed(2) %></td>
                    <td><%= q.term %>m</td>
                    <td>P<%= q.total_monthly_installment.toFixed(2) %></td>
                    <td>
                        <a href="/quotations/<%= q.serial_number %>">View</a> | 
                        <a href="/quotations/<%= q.serial_number %>/download">PDF</a>
                    </td>
                </tr>
            <% }) %>
        </tbody>
    </table>
\` }) %>
`,
    'views/users.ejs': `
<%- include('layout', { body: \`
    <h2>User Management</h2>
    <form method="POST" action="/users/add" style="margin-bottom: 20px; padding: 15px; border: 1px solid #ccc; border-radius: 4px;">
        <h3>Add User</h3>
        <div class="form-group"><input type="text" name="username" placeholder="Username" required></div>
        <div class="form-group"><input type="text" name="name" placeholder="Full Name" required></div>
        <div class="form-group"><input type="password" name="password" placeholder="Password" required></div>
        <div class="form-group">
            <select name="role">
                <option value="LOAN OFFICER">Loan Officer</option>
                <option value="ADMIN">Admin</option>
            </select>
        </div>
        <button type="submit">Add User</button>
    </form>
    <table>
        <thead>
            <tr>
                <th>Username</th>
                <th>Name</th>
                <th>Role</th>
                <th>Action</th>
            </tr>
        </thead>
        <tbody>
            <% users.forEach(u => { %>
                <tr>
                    <td><%= u.username %></td>
                    <td><%= u.name %></td>
                    <td><%= u.role %></td>
                    <td>
                        <% if (u.role !== 'SUPER ADMIN') { %>
                            <a href="/users/delete/<%= u.id %>" onclick="return confirm('Delete this user?');">Delete</a>
                        <% } else { %>
                            -
                        <% } %>
                    </td>
                </tr>
            <% }) %>
        </tbody>
    </table>
\` }) %>
`,
    'views/profile.ejs': `
<%- include('layout', { body: \`
    <h2>My Profile</h2>
    <p><strong>Username:</strong> <%= profileUser.username %></p>
    <p><strong>Name:</strong> <%= profileUser.name %></p>
    <p><strong>Role:</strong> <%= profileUser.role %></p>
    
    <h3>Change Password</h3>
    <% if (error) { %><div class="error"><%= error %></div><% } %>
    <% if (success) { %><div class="success"><%= success %></div><% } %>
    <form method="POST" action="/profile">
        <div class="form-group">
            <input type="password" name="currentPassword" placeholder="Current Password" required>
        </div>
        <div class="form-group">
            <input type="password" name="newPassword" placeholder="New Password" required>
        </div>
        <button type="submit">Change Password</button>
    </form>
\` }) %>
`
};

for (const [filepath, content] of Object.entries(files)) {
    const fullPath = path.join(__dirname, filepath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content.trim() + '\\n');
    console.log('Created ' + filepath);
}
