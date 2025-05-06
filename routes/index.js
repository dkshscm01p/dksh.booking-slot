let express = require("express");
let router = express.Router();
let conn = require("./connect");
let jwt = require("jsonwebtoken");
let secretCode = "myecomkey";
let session = require("express-session");

let axios = require("axios");
const { render } = require("ejs");

router.use(
  session({
    secret: "sessionforecommerce",
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  }),
);

router.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

router.get("/", (req, res) => {
  res.redirect("/login");
});

router.get("/login", (req, res) => {
  res.render("login");
})

router.post("/login", async (req, res) => {
  let { usr, pwd } = req.body;

  try {
    const result = await conn`
      SELECT * FROM tb_user WHERE usr = ${usr} AND pwd = ${pwd}
    `;

    if (result.length > 0) {
      // login pass
      let user = result[0];
      let token = jwt.sign(
        {
          id: user.id,
          name: user.name,
          company: user.company,
          level: user.level,
        },
        secretCode,
      );

      req.session.token = token;
      req.session.name = user.name;
      req.session.company = user.company;
      req.session.level = user.level;

      res.redirect("/info");
    } else {
      res.send("username or password invalid");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Database error");
  }
});

function isLogin(req, res, next) {
  if (req.session.token != undefined) {
    next();
  } else {
    res.redirect("login");
  }
}

router.get("/logout", isLogin, (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

router.get("/signupUser", (req, res) => {
  res.render("signupUser");
});

router.post("/addUser", async (req, res) => {
  let { usr, pwd, name, email, company } = req.body;
  try {
    let result = await conn`
    INSERT INTO tb_user (usr, pwd, name, email, company, level)
    VALUES (${usr}, ${pwd}, ${name}, ${email}, ${company}, ${"Member"})
    `
    res.redirect("/");
} catch {
    res.send("Error adding user");
}
})

router.get("/manageUser", isLogin, async (req, res) => {
  try {
    let results = await conn`SELECT * FROM tb_user`;
    res.render("manageUser", { name: req.session.name, userProfiles: results });
  } catch (err) {
    res.send("Error fetching user data");
  }
})


router.get("/deleteUser/:id", isLogin, async (req, res) => {
  try {
    let params = req.params.id;
    await conn`DELETE FROM tb_user WHERE id = ${params}`;
    res.redirect("/manageUser");
  } catch (err) {
    res.send("Error deleting user");
  }
})

router.get("/editUser/:id", isLogin, async (req, res) => {
  try {
    let params = req.params.id;
    let results = await conn`SELECT * FROM tb_user WHERE id = ${params}`;
    res.render("editUser", { name: req.session.name, user: results[0] });
  } catch (err) {
    res.send("Error fetching user data");
  }
})

router.get("/info", isLogin, (req, res) => {
  res.render("info", { name: req.session.name, company: req.session.company });
});

router.post("/info", isLogin, (req, res) => {
  const { warehouse, truckID, hours, slots, qtyPallet, qtyCases, loadType } = req.body;
  req.session.warehouse = warehouse;
  req.session.truckID = truckID;
  req.session.slots = slots;
  req.session.hours = hours;
  req.session.qtyPallet = qtyPallet;
  req.session.qtyCases = qtyCases;
  req.session.loadType = loadType;
  res.redirect("/bookSchedule");
});

router.get("/bookSchedule", isLogin, async (req, res) => {
  try {
    let { warehouse, truckID, slots, hours, qtyCases, qtyPallet } = req.session;
    let selectedDate =
      req.session.selectedDate || new Date().toISOString().split("T")[0];
    let params = [selectedDate];
    let results =
      await conn`SELECT * FROM tb_booking_slot WHERE date = ${params}`;
    res.render("bookSchedule", {
      name: req.session.name,
      level: req.session.level,
      warehouse,
      truckID,
      slots,
      hours,
      bookings: results,
      selectedDate: selectedDate,
      qtyCases: qtyCases,
      qtyPallet: qtyPallet,
    });
  } catch {
    res.send("Error fetching booking data");
  }
});

router.post("/bookSchedule", isLogin, async (req, res) => {
  try {
    let { warehouse, truckID, slots, hours } = req.session;
    let selectedDate = req.body.date;
    req.session.selectedDate = selectedDate;
    let results =
      await conn`SELECT * FROM tb_booking_slot WHERE date = ${selectedDate}`;
    let params = [selectedDate];
    res.render("bookSchedule", {
      name: req.session.name,
      warehouse,
      truckID,
      slots,
      hours,
      bookings: results,
      selectedDate: selectedDate,
    });
  } catch {
    res.send("Error fetching booking data");
  }
});


router.post("/addBook", isLogin, async (req, res) => {
  try {
    const selectedSlots = JSON.parse(req.body.selectedSlots);
    // สร้าง docno ใหม่
    const generateDocNumber = async () => {
      const today = new Date();
      const datePrefix = `DOC-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, "0")}${today.getDate().toString().padStart(2, "0")}`;
      const result = await conn`
        SELECT docno FROM tb_booking_slot
        WHERE docno LIKE ${datePrefix + '%'}
        ORDER BY docno DESC LIMIT 1
      `;
      const lastDocno = result[0]?.docno || `${datePrefix}-0000`;
      const lastNumber = parseInt(lastDocno.split("-").pop(), 10);
      return `${datePrefix}-${(lastNumber + 1).toString().padStart(4, "0")}`;
    };

    const getStartAndEndTime = (slots) => {
      const startTime = slots[0].slot.split("-")[0];
      const endTime = slots[slots.length - 1].slot.split("-")[1];
      return `${startTime}-${endTime}`;
    };
    
    const docno = await generateDocNumber(); // Generate a new docno
    
    // บันทึกทีละ slot
    const bookingPromises = selectedSlots.map(async (slot) => {
      
      const { company, name } = req.session;
      const { truckID, date, dock, wh } = slot;

      await conn`
        INSERT INTO tb_booking_slot (docno, company, name, truckID, date, dock, slot, wh)
        VALUES (${docno}, ${company}, ${name}, ${truckID}, ${date}, ${dock}, ${slot.slot}, ${wh})
      `;
    });

    await Promise.all(bookingPromises);

    // บันทึก summary ไป tb_schedule_slot
    const combinedSlot = getStartAndEndTime(selectedSlots);
    const firstSlot = selectedSlots[0];
    const totl_pallet = req.session.qtyPallet || 0;
    
    await conn`
      INSERT INTO tb_schedule_slot
        (docno, name, truckID, company, loadType, date, dock, slot, wh, totl_pallet, totl_cases)
      VALUES
        (${docno}, ${req.session.name}, ${firstSlot.truckID}, ${req.session.company},
         ${req.session.loadType}, ${firstSlot.date}, ${firstSlot.dock}, ${combinedSlot},
         ${firstSlot.wh}, ${totl_pallet}, ${req.session.qtyCases})
    `;

    req.session.selectedDate =
      req.session.selectedDate || new Date().toISOString().split("T")[0];

    res.redirect("/bookSchedule");
  } catch (error) {
    console.error("Booking Error:", error);
    res.status(500).send("Error processing booking");
  }
});


router.get("/mySchedule", isLogin, async (req, res) => {
  try {
    let selectedDate =
      req.session.selectedDate || new Date().toISOString().split("T")[0];
    console.log(selectedDate);
    let userLevel = req.session.level;
    let company = req.session.company;
    let results = [];

    if (userLevel === "Admin") {
      results =
        await conn`SELECT * FROM tb_schedule_slot WHERE date = ${selectedDate}`;
    } else if (userLevel === "Member") {
      results =
        await conn`SELECT * FROM tb_schedule_slot WHERE date = ${selectedDate} AND company = ${company}`;
    }
    res.render("mySchedule", {
      bookings: results,
      selectedDate: selectedDate,
      name: req.session.name,
    });
  } catch {
    res.send("Error fetching schedule data");
  }
});

router.post("/mySchedule", isLogin, async (req, res) => {
  try {
    let selectedDate = req.body.date;
    req.session.selectedDate = selectedDate;

    let results =
      await conn`SELECT * FROM tb_schedule_slot WHERE date = ${selectedDate}`;

    res.render("mySchedule", {
      bookings: results,
      selectedDate: selectedDate,
      name: req.session.name,
    });
  } catch {
    res.send("Error fetching schedule data");
  }
});


// Delete Booked
router.post("/deleteBooking", isLogin, async (req, res) => {
  try {
    let selectedDelete = JSON.parse(req.body.selectedDelete);
    console.log(selectedDelete);
    await conn`DELETE FROM tb_schedule_slot WHERE docno = ANY(${selectedDelete})`;
    await conn`DELETE FROM tb_booking_slot WHERE docno = ANY(${selectedDelete})`;
    res.redirect("/mySchedule");
  } catch {
    res.send("Error deleting booking data");
  }
});


// Navigate to Dashboard
router.get("/dashboard", isLogin, (req, res) => {
  let sql = "";
  let sqlSummarize = "";
  let role = {
    level: req.session.level,
    company: req.session.company,
  };
  let params = [role.company];

  // Get the date range filter from the request
  let range = req.query.range || "D1"; // Default to '1D' if no parameter is provided
  let dateCondition = "DATE(date) = CURDATE()"; // Default: Today

  if (range === "W1") {
    dateCondition = "DATE(date) >= CURDATE() - INTERVAL 7 DAY";
  } else if (range === "M1") {
    // dateCondition = 'DATE(date) >= CURDATE() - INTERVAL 1 MONTH';
    dateCondition = "MONTH(date) = MONTH(CURDATE())";
  } else if (range === "M3") {
    dateCondition = "DATE(date) >= CURDATE() - INTERVAL 3 MONTH";
  }

  if (role.level === "Admin") {
    sql = `SELECT * FROM tb_schedule_slot WHERE ${dateCondition}`;
    sqlSummarize = `SELECT company, SUM(totl_cases) AS totl_cases, SUM(totl_pallet) AS totl_pallet, COUNT(company) AS totl_truck
                      FROM tb_schedule_slot
                      WHERE ${dateCondition}
                      GROUP BY company`;
  } else {
    sql = `SELECT * FROM tb_schedule_slot WHERE company = ? AND ${dateCondition}`;
    sqlSummarize = `SELECT company, SUM(totl_cases) AS totl_cases, SUM(totl_pallet) AS totl_pallet, COUNT(company) AS totl_truck
                      FROM tb_schedule_slot
                      WHERE company = ? AND ${dateCondition}
                      GROUP BY company`;
  }

  conn.query(sql, params, (err, results) => {
    if (err) throw err;

    // Calculation total cases
    let totalCases = results.reduce((sum, row) => sum + row.totl_cases, 0);
    let totalPallet = results.reduce((sum, row) => sum + row.totl_pallet, 0);

    conn.query(sqlSummarize, params, (err, sum_results) => {
      if (err) throw err;
      res.render("dashboard", {
        name: req.session.name,
        bookings: results,
        sum_bookings: sum_results,
        totalCases: totalCases,
        totalPallet: totalPallet,
      });
    });
  });
});

router.get("/api/getChartData", isLogin, (req, res) => {
  let range = req.query.range || "D1";
  let sql = "";
  let params = [];
  let dateCondition = "DATE(date) = CURDATE()"; // Default: Today

  if (range === "W1") {
    dateCondition = "DATE(date) >= CURDATE() - INTERVAL 7 DAY";
  } else if (range === "M1") {
    // dateCondition = 'DATE(date) >= CURDATE() - INTERVAL 1 MONTH';
    dateCondition = "MONTH(date) = MONTH(CURDATE())";
  } else if (range === "M3") {
    dateCondition = "DATE(date) >= CURDATE() - INTERVAL 3 MONTH";
  }

  sql = `SELECT DATE(date) AS x, SUM(totl_cases) AS y FROM tb_schedule_slot WHERE ${dateCondition}`;

  conn.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

router.get("/printBookslot/:id", async (req, res) => {
  try {
    let params = req.params.id;
    let results =
      await conn`SELECT * FROM tb_schedule_slot WHERE id = ${params}`;
    res.render("printBookslot", { booking: results[0] });
  } catch {
    res.send("Error fetching booking data");
  }
});

module.exports = router;
