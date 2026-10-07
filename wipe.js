const db = require('./db');
db.serialize(() => {
    db.run('DELETE FROM quotations', (err) => {
        if(err) console.error(err);
        else console.log('Deleted all quotations');
    });
    db.run("DELETE FROM sqlite_sequence WHERE name='quotations'", (err) => {
        if(err) console.error(err);
        else console.log('Reset auto-increment');
    });
    setTimeout(() => db.close(), 1000);
});
