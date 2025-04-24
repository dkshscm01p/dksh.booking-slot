let express = require('express');
let router = express.Router();
let conn = require('./connect');
let jwt = require('jsonwebtoken');
let secretCode = 'myecomkey';
let session = require('express-session');
let axios = require('axios');
const { render } = require('ejs');

router.use(session({
  secret: 'sessionforecommerce',
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}))

router.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.get('/login', (req, res) => {
  res.render('login');
})

router.post('/login', (req, res) => {
  let sql = 'SELECT * FROM tb_user WHERE usr = ? AND pwd = ?'
  let params = [
    req.body.usr,
    req.body.pwd
  ]

  conn.query(sql, params, (err, result) => {
    if (err) throw err;

    if (result.length > 0) {
      // login pass
      let id = result[0].id;
      let name = result[0].name;
      let company = result[0].company;
      let level = result[0].level;
      let token = jwt.sign({id: id, name: name, company: company, level: level}, secretCode);

      req.session.token = token;
      req.session.name = name;
      req.session.company = company;
      req.session.level = level

      res.redirect('/info');
    } else {
      res.send('username or password invaild');
    }
  })

})

  function isLogin(req, res, next) {
    if (req.session.token != undefined) {
      next()
    } else {
      res.redirect('login');
    }
  }

  router.get('/logout', isLogin, (req, res) => {
    req.session.destroy();
    res.redirect('login');
  })

  router.get('/signupUser', (req, res) => {
    res.render('signupUser');
  })

  router.post('/addUser', (req, res) => {
    let sql = 'INSERT INTO tb_user SET ?'
    let params = {
      usr: req.body.usr,
      pwd: req.body.pwd,
      name: req.body.name,
      email: req.body.email,
      company: req.body.company,
      level: "Member"
    }

    conn.query(sql, params, (err, results) => {
      if (err) throw err;
      res.redirect('/login')
    })
  })

  router.get('/manageUser', isLogin, (req, res) => {
    let sql = 'SELECT * FROM tb_user'

    conn.query(sql, (err, results) => {
      res.render('manageUser', { name: req.session.name, userProfiles: results });
    })
  })

  router.get('/deleteUser/:id', isLogin, (req, res) => {
    let sql = 'DELETE FROM tb_user WHERE id = ?';
    let params = req.params.id;

    conn.query(sql, params, (err, results) => {
      if (err) throw err;
      res.redirect('/manageUser');
    })
  })

  router.get('/editUser/:id', isLogin, (req, res) => {
    let sql = 'SELECT * FROM tb_user WHERE id = ?';
    let params = req.params.id;

    conn.query(sql, params, (err, results) => {
      if (err) throw err;
      res.render('editUser', { name: req.session.name, user: results[0] });
    })
  })

  router.post('/book', isLogin, (req, res) => {
    let sql = 'SELECT * FROM tb_booking_slot WHERE dock = ? AND date = ? AND slot = ?'
    let params = [
      req.body.dock,
      req.body.date,
      req.body.slot
    ]

    conn.query(sql, params, (err, result) => {
      if (err) throw err;
      
      if (result.length > 0) {
        // ถ้าช่วงเวลานั้นถูกจองไปแล้ว
        res.send('ช่วงเวลานี้ถูกจองไปแล้ว กรุณาเลือกช่วงเวลาอื่น');
      } else {
        // ถ้าไม่มีการจองในช่วงเวลานั้น
        let sql = 'INSERT INTO tb_booking_slot SET ?'
        let params = {
          name: req.body.name,
          dock: req.body.dock,
          date: req.body.date,
          slot: req.body.slot
        }

        conn.query(sql, params, (err, result) => {
        if (err) throw err;
        res.redirect('/schedule'); // กลับไปหน้าหลักหลังจากทำการจองสำเร็จ
        })
      }
    })
  })

  
router.get('/info', isLogin, (req, res) => {
  res.render('info', { name : req.session.name, company : req.session.company });
})

router.post('/info', isLogin, (req, res) => {
  const { warehouse, truckID, hours, slots, qtyPallet, qtyCases, loadType } = req.body;
  req.session.warehouse = warehouse;
  req.session.truckID = truckID;
  req.session.slots = slots;
  req.session.hours = hours;
  req.session.qtyPallet = qtyPallet;
  req.session.qtyCases = qtyCases;
  req.session.loadType = loadType
  res.redirect('/bookSchedule');

});


router.get('/bookSchedule', isLogin, (req, res) => {
  let { warehouse, truckID, slots, hours, qtyCases, qtyPallet} = req.session;
  let selectedDate = req.session.selectedDate || new Date().toISOString().split('T')[0];
  let sql = 'SELECT * FROM tb_booking_slot WHERE date = ?';
  let params = [selectedDate];

  conn.query(sql, params, (err, results) => {
      if (err) throw err;
      res.render('bookSchedule', { name : req.session.name , level: req.session.level, warehouse, truckID, slots, hours, bookings: results, selectedDate: selectedDate, qtyCases: qtyCases, qtyPallet: qtyPallet });
  });

})

router.post('/bookSchedule', isLogin, (req, res) => {
  let { warehouse, truckID, slots, hours} = req.session;
  let selectedDate = req.body.date;
  req.session.selectedDate = selectedDate
  let sql = 'SELECT * FROM tb_booking_slot WHERE date = ?';
  let params = [selectedDate];

  conn.query(sql, params, (err, results) => {
      if (err) throw err;
      res.render('bookSchedule', { name : req.session.name , warehouse, truckID, slots, hours, bookings: results, selectedDate: selectedDate } );
  });

})


router.post('/addBook', isLogin, async (req, res) => {
  try {
    const selectedSlots = JSON.parse(req.body.selectedSlots); // Get the selected slots from the form
    
    // Helper function to generate the next docno
    const generateDocNumber = () => {
      return new Promise((resolve, reject) => {
        const today = new Date();
        const datePrefix = `DOC-${today.getFullYear()}${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}`;

        let sql = `SELECT docno FROM tb_booking_slot WHERE docno LIKE '${datePrefix}%' ORDER BY docno DESC LIMIT 1`;
        conn.query(sql, (err, results) => {
          if (err) {
            console.error('Error fetching last docno:', err);
            return reject(err);
          }

          const lastDocno = results[0]?.docno || `${datePrefix}-0000`;
          const lastNumber = parseInt(lastDocno.split('-').pop(), 10);
          const nextDocno = `${datePrefix}-${(lastNumber + 1).toString().padStart(4, '0')}`;
          resolve(nextDocno);
        });
      });
    };

    // Calculate the start and end time for the selected slots
    const getStartAndEndTime = (selectedSlots) => {
      const startTime = selectedSlots[0].slot.split('-')[0]; // First slot start time
      const endTime = selectedSlots[selectedSlots.length - 1].slot.split('-')[1]; // Last slot end time
      return `${startTime}-${endTime}`;
    };

    // จอง slot booking ทีละรายการ
    const bookingPromises = selectedSlots.map(async (slot) => {
      const docno = await generateDocNumber();

      const bookingData = {
        docno: docno,
        company: req.session.company,
        name: req.session.name,
        truckID: slot.truckID,
        date: slot.date,
        dock: slot.dock,
        slot: slot.slot,
        wh: slot.wh
      };

      return new Promise((resolve, reject) => {
        let sql = 'INSERT INTO tb_booking_slot SET ?';
        conn.query(sql, bookingData, (err, result) => {
          if (err) {
            console.error('Error saving booking:', err);
            return reject(err);
          }
          console.log(bookingData);
          resolve(result);
        });
      });
    });

    await Promise.all(bookingPromises); // รอให้ทุก booking ถูกบันทึกก่อน

    // Get the combined start and end time for the selected slots
    const combinedSlot = getStartAndEndTime(selectedSlots);
    const firstSlot = selectedSlots[0];
    const docno = await generateDocNumber();

    const scheduleSlot = {
      docno: docno,
      name: req.session.name,
      truckID: firstSlot.truckID,
      company: req.session.company,
      loadType: req.session.loadType,
      date: firstSlot.date,
      dock: firstSlot.dock,
      slot: combinedSlot,
      wh: firstSlot.wh,
      totl_pallet: req.session.qtyPallet,
      totl_cases: req.session.qtyCases
    };

    await new Promise((resolve, reject) => {
      let sql = 'INSERT INTO tb_schedule_slot SET ?';
      conn.query(sql, scheduleSlot, (err, result) => {
        if (err) {
          console.error('Error saving schedule:', err);
          return reject(err);
        }
        resolve(result);
      });
    });

    req.session.selectedDate = req.session.selectedDate || new Date().toISOString().split('T')[0];

    // หลังจาก query เสร็จทั้งหมดค่อย redirect
    res.redirect('/bookSchedule');
  } catch (error) {
    res.status(500).send('Error processing booking');
  }
});



// ดึงข้อมูลจากฐานข้อมูล
router.get('/mySchedule', isLogin, (req, res) => {
  
  let selectedDate = req.session.selectedDate || new Date().toISOString().split('T')[0];
  let userLevel = req.session.level
  let company = req.session.company
  let sql = ''
  
  if (userLevel === 'Admin') {
    sql = 'SELECT * FROM tb_schedule_slot WHERE date = ?';
  } else if (userLevel === 'Member') {
    sql = 'SELECT * FROM tb_schedule_slot WHERE date = ? AND company = ?';
  }
  
  let params = [selectedDate, company];
  conn.query(sql, params, (err, results) => {
      if (err) throw err;
      console.log(req.body.date);
      res.render('mySchedule', { bookings: results, selectedDate: selectedDate, name : req.session.name });
  });
});

router.post('/mySchedule', isLogin, (req, res) => {
  
  let selectedDate = req.body.date;
  req.session.selectedDate = selectedDate;

  let sql = 'SELECT * FROM tb_schedule_slot WHERE date = ?';
  let params = [selectedDate];

  conn.query(sql, params, (err, results) => {
    if (err) throw err;
    res.render('mySchedule', { bookings: results, selectedDate: selectedDate, name : req.session.name });
  });
});

// Delete Booked
router.post('/deleteBooking', isLogin, (req, res) => {
  let selectedDelete = JSON.parse(req.body.selectedDelete);

  let deleteQueries = [
    { sql : 'DELETE FROM tb_schedule_slot WHERE docno IN (?)' },
    { sql : 'DELETE FROM tb_booking_slot WHERE docno IN (?)' }
  ]

  deleteQueries.forEach(query => {
    conn.query(query.sql, [selectedDelete], (err, reuslt) => {
      if (err) throw err;
    })
  })
  res.redirect('/mySchedule');
});

// Navigate to Dashboard
router.get('/dashboard', isLogin, (req, res) => {
  let sql = '';
  let sqlSummarize = '';
  let role = {
                level: req.session.level,
                company: req.session.company
              }
  let params = [role.company];
 
  // Get the date range filter from the request
  let range = req.query.range || 'D1';  // Default to '1D' if no parameter is provided
  let dateCondition = 'DATE(date) = CURDATE()'; // Default: Today

  if (range === 'W1') {
    dateCondition = 'DATE(date) >= CURDATE() - INTERVAL 7 DAY';
  } else if (range === 'M1') {
    // dateCondition = 'DATE(date) >= CURDATE() - INTERVAL 1 MONTH';
    dateCondition = 'MONTH(date) = MONTH(CURDATE())';
  } else if (range === 'M3') {
    dateCondition = 'DATE(date) >= CURDATE() - INTERVAL 3 MONTH';
  }
  
  if ( role.level === 'Admin' ) {
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
    let totalCases = results.reduce((sum, row) => sum + row.totl_cases,0);
    let totalPallet = results.reduce((sum, row) => sum + row.totl_pallet,0);

  conn.query(sqlSummarize, params, (err, sum_results) => {
    if (err) throw err;
    res.render('dashboard', { 
      name : req.session.name,
      bookings: results, 
      sum_bookings: sum_results, 
      totalCases: totalCases, 
      totalPallet: totalPallet 
    });
    })
  })
})

router.get('/api/getChartData', isLogin, (req, res) => {
  let range = req.query.range || 'D1';
  let sql = '';
  let params = [];
  let dateCondition = 'DATE(date) = CURDATE()'; // Default: Today

  if (range === 'W1') {
    dateCondition = 'DATE(date) >= CURDATE() - INTERVAL 7 DAY';
  } else if (range === 'M1') {
    // dateCondition = 'DATE(date) >= CURDATE() - INTERVAL 1 MONTH';
    dateCondition = 'MONTH(date) = MONTH(CURDATE())';
  } else if (range === 'M3') {
    dateCondition = 'DATE(date) >= CURDATE() - INTERVAL 3 MONTH';
  }
  
    sql = `SELECT DATE(date) AS x, SUM(totl_cases) AS y FROM tb_schedule_slot WHERE ${dateCondition}`;
    
  conn.query(sql, params, (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(results);
  });

});



router.get('/printBookslot/:id', (req, res) => {
  let sql = 'SELECT * FROM tb_schedule_slot WHERE id = ?';
  let params = req.params.id;

  conn.query(sql, params, (err, results) => {

    console.log(results);
    if (err) throw err;
    res.render('printBookslot', { booking: results[0] });
    
  })
  
})

module.exports = router;
