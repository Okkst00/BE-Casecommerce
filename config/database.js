const mysql = require("mysql");

const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "casecommerce",
});

connection.connect((err) => {
  if (err) {
    console.error("Kesalahan koneksi:", err.stack);
    return;
  }
  console.log("Terhubung dengan database MySQL dengan id", connection.threadId);
});
