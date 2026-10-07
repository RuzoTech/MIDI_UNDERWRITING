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

// Calculation logic
function calculateQuotation(loanAmount, term, includeFuneralPolicy) {
    const adminFee = loanAmount * 0.08;
    const insurance = loanAmount * 0.0142;
    const loyalty = 25;
    const netAdminFee = adminFee - loyalty;
    const adjustedLoanAmount = loanAmount + adminFee;

    let interestRate;
    switch(term) {
        case 3:  interestRate = 0.125;  break;
        case 6:  interestRate = 0.060;  break;
        case 12: interestRate = 0.060;  break;
        case 18: interestRate = 0.045;  break;
        case 24: interestRate = 0.040;  break;
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
        loanAmount, term, interestRate, includeFuneralPolicy,
        adminFee, insurance, loyalty, netAdminFee, adjustedLoanAmount,
        installment, collectionFee, funeralPolicyAmount,
        totalMonthlyInstallment, totalCollectible
    };
}

// Build amortization schedule rows
function buildAmortizationSchedule(row) {
    const adjAmt = row.adjusted_loan_amount || row.loan_amount;
    const installmentAmt = row.installment || (row.total_monthly_installment || 0);
    const principalPerMonth = adjAmt / row.term;
    const interestPerMonth = installmentAmt - principalPerMonth;
    const schedule = [];
    let openingBal = adjAmt;
    for (let i = 1; i <= row.term; i++) {
        const closingBal = Math.max(0, openingBal - principalPerMonth);
        schedule.push({
            month: i,
            opening: openingBal,
            principal: principalPerMonth,
            interest: interestPerMonth,
            closing: closingBal
        });
        openingBal = closingBal;
    }
    return schedule;
}

function generateSerialNumber() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}

app.post('/generate-quote', isAuthenticated, (req, res) => {
    const loanAmount = parseFloat(req.body.loanAmount);
    const term = parseInt(req.body.term);
    const includeFuneralPolicy = req.body.funeralPolicy === 'Yes';

    const applicantName    = req.body.applicantName    || '';
    const applicantSurname = req.body.applicantSurname || '';
    const omangPassport    = req.body.omangPassport    || '';
    const salary           = parseFloat(req.body.salary) || 0;

    if (loanAmount < 4000 || loanAmount > 50000) return res.status(400).send("Invalid loan amount. Min 4000, Max 50000.");

    let allowedTerms = [];
    if (loanAmount <= 5000)  allowedTerms = [3, 6];
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

    db.run(`INSERT INTO quotations
        (serial_number, date, time, generated_by, loan_amount, term, interest_rate, funeral_policy_selection,
         admin_fee, loyalty, net_admin_fee, adjusted_loan_amount, installment, collection_fee,
         funeral_policy_amount, total_monthly_installment, total_collectible,
         applicant_name, applicant_surname, omang_passport, salary, insurance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [serialNumber, dateStr, timeStr, req.session.user.username,
         calc.loanAmount, calc.term, calc.interestRate, calc.includeFuneralPolicy ? 'Yes' : 'No',
         calc.adminFee, calc.loyalty, calc.netAdminFee, calc.adjustedLoanAmount,
         calc.installment, calc.collectionFee, calc.funeralPolicyAmount,
         calc.totalMonthlyInstallment, calc.totalCollectible,
         applicantName, applicantSurname, omangPassport, salary, calc.insurance],
        function(err) {
            if (err) return res.status(500).send("Error saving quote: " + err.message);
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
        const schedule = buildAmortizationSchedule(row);
        res.render('quotation_detail', { quote: row, schedule });
    });
});

// ── PDF DOWNLOAD ─────────────────────────────────────────────────────────────
app.get('/quotations/:serial/download', isAuthenticated, (req, res) => {
    db.get('SELECT * FROM quotations WHERE serial_number = ?', [req.params.serial], (err, row) => {
        if (!row) return res.status(404).send("Not found");

        const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true });
        const filename = 'Quotation_' + row.serial_number + '.pdf';
        res.setHeader('Content-disposition', 'attachment; filename="' + filename + '"');
        res.setHeader('Content-type', 'application/pdf');
        doc.pipe(res);

        // Safe numeric coercion (DB may return strings for TEXT-typed columns)
        const n = (v) => parseFloat(v) || 0;

        const pageW    = doc.page.width;   // 595.28
        const pageH    = doc.page.height;  // 841.89
        const marginL  = 40;
        const contentW = pageW - marginL * 2;
        const GOLD     = '#C9A84C';
        const BLACK    = '#111111';
        const LGREY    = '#F7F7F7';
        const MGREY    = '#CCCCCC';

        // ── LETTERHEAD ───────────────────────────────────────────────────────
        const letterheadPath = path.join(__dirname, 'public', 'Letterhead.jpg');
        const logoPath       = path.join(__dirname, 'public', 'Picture1.jpg');

        let contentStartY = 30;
        if (fs.existsSync(letterheadPath)) {
            // Draw letterhead spanning full page width at y=0
            doc.image(letterheadPath, 0, 0, { width: pageW });
            contentStartY = 145;
        } else if (fs.existsSync(logoPath)) {
            doc.image(logoPath, marginL, 15, { height: 65 });
            contentStartY = 95;
        } else {
            doc.fontSize(26).font('Helvetica-Bold').fillColor(GOLD)
               .text('MIDI', marginL, 20);
            contentStartY = 80;
        }

        let y = contentStartY;

        // ── TITLE BAR: "QUOTATION" ───────────────────────────────────────────
        doc.rect(marginL, y, contentW, 26).fill(BLACK);
        doc.fontSize(13).font('Helvetica-Bold').fillColor(GOLD)
           .text('QUOTATION', marginL, y + 7, { width: contentW, align: 'center' });
        y += 30;

        // ── Ref line ────────────────────────────────────────────────────────
        doc.fontSize(8).font('Helvetica').fillColor('#444444')
           .text(
               'Ref: ' + row.serial_number +
               '   |   Date: ' + row.date + '  ' + row.time +
               '   |   Prepared by: ' + row.generated_by,
               marginL, y, { width: contentW, align: 'right' }
           );
        y += 18;

        // ── Helper: section header bar ───────────────────────────────────────
        function sectionBar(title, yPos) {
            doc.rect(marginL, yPos, contentW, 20).fill('#222222');
            doc.fontSize(9).font('Helvetica-Bold').fillColor(GOLD)
               .text(title, marginL + 8, yPos + 6, { width: contentW - 16 });
            return yPos + 22;
        }

        // ── Helper: data row (label / value) ─────────────────────────────────
        function dataRow(label, value, yPos, shaded) {
            const rH = 18;
            if (shaded) doc.rect(marginL, yPos, contentW, rH).fill(LGREY).stroke(MGREY);
            else        doc.rect(marginL, yPos, contentW, rH).stroke(MGREY);
            const labelW = contentW * 0.60;
            const valW   = contentW * 0.40 - 8;
            doc.fontSize(8.5).font('Helvetica-Bold').fillColor(BLACK)
               .text(label, marginL + 8, yPos + 5, { width: labelW });
            doc.fontSize(8.5).font('Helvetica').fillColor(BLACK)
               .text(value, marginL + labelW, yPos + 5, { width: valW, align: 'right' });
            return yPos + rH;
        }

        // ── PERSONAL DETAILS ─────────────────────────────────────────────────
        y = sectionBar('PERSONAL DETAILS', y);
        y = dataRow('Applicant Name & Surname',
                    (row.applicant_name || '') + ' ' + (row.applicant_surname || ''), y, false);
        y = dataRow('Omang / Passport No', row.omang_passport || 'N/A', y, true);
        y = dataRow('Monthly Salary', 'BWP ' + parseFloat(row.salary || 0).toFixed(2), y, false);
        y += 10;

        // ── LOAN DETAILS ─────────────────────────────────────────────────────
        y = sectionBar('LOAN DETAILS', y);
        y = dataRow('Loan Amount Requested',   'BWP ' + n(row.loan_amount).toFixed(2), y, false);
        y = dataRow('Loan Term',               row.term + ' months', y, true);
        y = dataRow('Interest Rate',           (n(row.interest_rate) * 100).toFixed(2) + '% per month', y, false);
        y = dataRow('Admin Fee (8%)',          'BWP ' + n(row.admin_fee).toFixed(2), y, true);
        y = dataRow('Insurance (1.42%)',       'BWP ' + n(row.insurance).toFixed(2), y, false);
        y = dataRow('Funeral Policy',          row.funeral_policy_selection, y, true);
        y += 4;

        // Dark total row: Monthly Payment
        const tH = 22;
        doc.rect(marginL, y, contentW, tH).fill('#1a1a1a');
        const lW2 = contentW * 0.60;
        const vW2 = contentW * 0.40 - 8;
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor(GOLD)
           .text('Monthly Payment', marginL + 8, y + 7, { width: lW2 });
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor(GOLD)
           .text('BWP ' + n(row.total_monthly_installment).toFixed(2), marginL + lW2, y + 7, { width: vW2, align: 'right' });
        y += tH;

        // Gold total row: Total Amount Payable
        doc.rect(marginL, y, contentW, tH).fill(GOLD);
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor(BLACK)
           .text('Total Amount Payable (all costs & interest included)', marginL + 8, y + 7, { width: lW2 });
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor(BLACK)
           .text('BWP ' + n(row.total_collectible).toFixed(2), marginL + lW2, y + 7, { width: vW2, align: 'right' });
        y += tH + 12;

        // ── AMORTIZATION SCHEDULE ────────────────────────────────────────────
        y = sectionBar('AMORTIZATION SCHEDULE', y);

        // Column layout
        const C = {
            month:    { x: marginL,       w: 35  },
            opening:  { x: marginL + 35,  w: 110 },
            principal:{ x: marginL + 145, w: 100 },
            interest: { x: marginL + 245, w: 100 },
            closing:  { x: marginL + 345, w: contentW - 345 }
        };
        const hdrs2 = ['Month', 'Opening Balance', 'Principal', 'Interest', 'Closing Balance'];
        const cols2 = [C.month, C.opening, C.principal, C.interest, C.closing];

        function drawAmortHeader(yPos) {
            doc.rect(marginL, yPos, contentW, 18).fill('#333333');
            hdrs2.forEach((h, i) => {
                doc.fontSize(7.5).font('Helvetica-Bold').fillColor(GOLD)
                   .text(h, cols2[i].x + 3, yPos + 5, { width: cols2[i].w - 4, align: i === 0 ? 'center' : 'right' });
            });
            return yPos + 18;
        }

        y = drawAmortHeader(y);

        const schedule = buildAmortizationSchedule(row);
        const rowH2 = 15;

        schedule.forEach((s, idx) => {
            // Page break check
            if (y + rowH2 > pageH - 80) {
                doc.addPage({ size: 'A4', margin: 0 });
                y = 30;
                y = drawAmortHeader(y);
            }
            const shaded = idx % 2 === 1;
            if (shaded) doc.rect(marginL, y, contentW, rowH2).fill(LGREY).stroke(MGREY);
            else        doc.rect(marginL, y, contentW, rowH2).stroke(MGREY);

            doc.fontSize(7.5).font('Helvetica').fillColor(BLACK)
               .text(s.month.toString(), C.month.x + 3, y + 4, { width: C.month.w - 4, align: 'center' });
            doc.text('BWP ' + s.opening.toFixed(2),    C.opening.x + 3,    y + 4, { width: C.opening.w - 4,    align: 'right' });
            doc.text('BWP ' + s.principal.toFixed(2),  C.principal.x + 3,  y + 4, { width: C.principal.w - 4,  align: 'right' });
            doc.text('BWP ' + s.interest.toFixed(2),   C.interest.x + 3,   y + 4, { width: C.interest.w - 4,   align: 'right' });
            doc.text('BWP ' + s.closing.toFixed(2),    C.closing.x + 3,    y + 4, { width: C.closing.w - 4,    align: 'right' });
            y += rowH2;
        });

        y += 18;

        // ── SIGNATURE / FOOTER ───────────────────────────────────────────────
        if (y + 80 > pageH - 20) {
            doc.addPage({ size: 'A4', margin: 0 });
            y = 40;
        }

        doc.fontSize(8.5).font('Helvetica').fillColor(BLACK)
           .text('Deduction will be done through LESAKA.', marginL, y);
        y += 22;
        doc.moveTo(marginL, y).lineTo(marginL + 220, y).stroke(MGREY);
        doc.text('Signed by', marginL, y + 4);
        doc.moveTo(marginL + 270, y).lineTo(marginL + 450, y).stroke(MGREY);
        doc.text('Date', marginL + 270, y + 4);
        y += 30;

        doc.fontSize(7.5).font('Helvetica-Oblique').fillColor('#777777')
           .text(
               'This quotation is valid for 30 days and is subject to final credit approval. ' +
               'All figures are illustrative and may change upon application.',
               marginL, y, { width: contentW, align: 'center' }
           );

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