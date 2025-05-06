const postgres = require('postgres');
require('dotenv').config(); // โหลดตัวแปรจาก .env

const conn = postgres(process.env.DATABASE_URL); // ดึงค่าจาก .env มาใช้

module.exports = conn;



// let mysql = require("mysql");
// let conn = mysql.createConnection({
//     host: "localhost",
//     user: "root",
//     password: "",
//     database: "db_booking_slot",
// });

// conn.connect((err) => {
//     if (err) throw err;
//     console.log("connect database successfully");
// });

// module.exports = conn;


