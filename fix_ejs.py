import os

header = """<!DOCTYPE html>
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
"""

footer = """
    </div>
</body>
</html>
"""

with open('views/header.ejs', 'w') as f:
    f.write(header)

with open('views/footer.ejs', 'w') as f:
    f.write(footer)

views = ['login.ejs', 'calculator.ejs', 'quotations.ejs', 'quotation_detail.ejs', 'users.ejs', 'profile.ejs']
for v in views:
    path = os.path.join('views', v)
    with open(path, 'r') as f:
        content = f.read()
    
    # Extract just the string content inside body: ` ... `
    import re
    # Match everything between body: ` and ` }) %>
    match = re.search(r"body:\s*`([\s\S]*?)`\s*\}\)", content)
    if match:
        inner = match.group(1)
        new_content = "<%- include('header') %>\n" + inner + "\n<%- include('footer') %>"
        with open(path, 'w') as f:
            f.write(new_content)
