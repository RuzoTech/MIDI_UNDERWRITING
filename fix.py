import os

files = ['server.js', 'db.js', 'views/login.ejs', 'views/layout.ejs', 'views/calculator.ejs', 'views/quotations.ejs', 'views/quotation_detail.ejs', 'views/users.ejs', 'views/profile.ejs']

for f in files:
    with open(f, 'r') as file:
        content = file.read()
    content = content.replace('\\\\n', '\n').replace('\\`', '`')
    with open(f, 'w') as file:
        file.write(content)
