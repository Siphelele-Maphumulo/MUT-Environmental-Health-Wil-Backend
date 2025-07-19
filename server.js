require("dotenv").config();
const express = require("express");
const mysql = require("mysql2/promise");
const bcrypt = require('bcryptjs');
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const session = require("express-session");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const moment = require('moment');
const helmet = require("helmet");

const app = express();

// ======= Environment Configuration ======= //
const PORT = process.env.PORT || 10000;
const isProduction = process.env.NODE_ENV === "production";

// URLs configuration
const frontendUrls = [
  "http://localhost:4200",
  "https://environmental-health-wil-frontend.netlify.app"
];
const backendUrl = isProduction 
  ? "https://mut-environmental-health-wil-backend.onrender.com" 
  : `http://localhost:${PORT}`;

// ======= Session Store Configuration ======= //
let sessionStore = new session.MemoryStore();
if (isProduction) {
  console.warn("Using MemoryStore in production - not recommended");
  console.warn("For production, please configure Redis with REDIS_URL");
}

// ======= Middleware ======= //
app.use(express.json());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Security middleware
app.use(helmet());

// Configure Content Security Policy
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com data:; " +
    "img-src 'self' data: blob:; " +
    "connect-src 'self' " + backendUrl + " " + frontendUrls.join(" ") + "; " +
    "frame-src 'none'; " +
    "object-src 'none'"
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// CORS configuration
app.use(cors({
  origin: frontendUrls,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Session configuration
app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || "your-secret-key",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 1000 * 60 * 60 // 1 hour
  }
}));

if (isProduction) {
  app.set('trust proxy', 1);
}

// ======= File Upload Configuration ======= //
const UPLOADS_PATH = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_PATH)) {
  fs.mkdirSync(UPLOADS_PATH, { recursive: true });
}

const upload = multer({ 
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_PATH),
    filename: (req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${uniqueSuffix}-${file.originalname}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

app.use("/uploads", express.static(UPLOADS_PATH));

// ======= Routes ======= //
// Add your routes here...

// Health check endpoint
app.get("/", (req, res) => {
  res.status(200).json({ 
    status: "Server is running",
    environment: isProduction ? "production" : "development"
  });
});

// ======= Email Configuration ======= //
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: isProduction
  }
});

function generateCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

// ======= Routes ======= //
app.get("/api/protected", isAuthenticated, (req, res) => {
  res.json({ 
    message: "You are authorized!", 
    user: {
      id: req.user.userId,
      email: req.user.email,
      role: req.user.role
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++//
app.get("/api/hospitals", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT name FROM hospitals ORDER BY name"
    );
    res.status(200).json(rows.map((row) => row.name));
  } catch (err) {
    console.error("Error fetching hospitals:", err);
    res.status(500).json({ message: "Failed to fetch hospitals" });
  }
});

app.get("/api/municipalities", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT name FROM municipalities ORDER BY name"
    );
    res.status(200).json(rows.map((row) => row.name));
  } catch (err) {
    console.error("Error fetching municipalities:", err);
    res.status(500).json({ message: "Failed to fetch municipalities" });
  }
});

//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++//

// ======= Students Signup Route ======= //
app.post("/api/student_signup", async (req, res) => {
  const { email, title, password, code } = req.body;

  if (!code) {
    return res.status(400).json({ message: "Signup code is required" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Validate the signup code
    const [codeRows] = await connection.execute(
      `SELECT * FROM signup_codes WHERE code = ?`,
      [code]
    );

    if (codeRows.length === 0) {
      await connection.rollback();
      return res
        .status(400)
        .json({ message: "Invalid or expired signup code" });
    }

    // Hash the password once for both inserts
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into student_users table
    await connection.execute(
      "INSERT INTO student_users (email, title, password) VALUES (?, ?, ?)",
      [email, title, hashedPassword]
    );

    // Insert into users table
    await connection.execute(
      "INSERT INTO users (email, title, password) VALUES (?, ?, ?)",
      [email, title, hashedPassword]
    );

    // Remove the used signup code
    await connection.execute("DELETE FROM signup_codes WHERE code = ?", [code]);

    await connection.commit();

    res.status(201).json({
      message: "User registered successfully in both systems",
      data: { email, title },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error during signup:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        message: "Email already exists in one or both systems",
        details: error.message,
      });
    }

    res.status(500).json({
      message: "Signup failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  } finally {
    connection.release();
  }
});

// ======= Staff Signup Route ======= //
app.post("/api/staff_Signup", async (req, res) => {
  const { email, title, password, code } = req.body;

  if (!code) {
    return res.status(400).json({ message: "Signup code is required" });
  }

  const connection = await pool.getConnection(); // <-- add this line

  try {
    await connection.beginTransaction(); // <-- start transaction

    // First, validate if the code still exists
    const [rows] = await connection.execute(
      `SELECT * FROM staff_codes WHERE code = ?`,
      [code]
    );

    if (rows.length === 0) {
      await connection.rollback(); // <-- rollback if no code
      return res
        .status(400)
        .json({ message: "Invalid or expired signup code" });
    }

    // Proceed with user creation
    const hashedPassword = await bcrypt.hash(password, 10);
    const query =
      "INSERT INTO staff_users (email, title, password) VALUES (?, ?, ?)";
    await connection.execute(query, [email, title, hashedPassword]);

    // After successful signup, delete the code
    await connection.execute(`DELETE FROM staff_codes WHERE code = ?`, [code]);

    await connection.commit(); // <-- commit transaction

    res
      .status(201)
      .json({ message: "User registered successfully and code deleted" });
  } catch (error) {
    await connection.rollback(); // <-- rollback on error
    console.error("Error during signup:", error);
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ message: "Email already exists" });
    }
    res.status(500).json({ message: "Signup failed" });
  } finally {
    connection.release(); // <-- important to release connection
  }
});


// ======= Mentor Signup Route ======= //
app.post("/api/mentor_signup", async (req, res) => {
  const { email, title, password, code } = req.body;

  if (!code) {
    return res.status(400).json({ message: "Signup code is required" });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Check code validity
    const [rows] = await connection.execute(
      `SELECT * FROM staff_codes WHERE code = ?`,
      [code]
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: "Invalid or expired signup code" });
    }

    // Hash password and insert mentor
    const hashedPassword = await bcrypt.hash(password, 10);
    const insertQuery =
      "INSERT INTO mentor_users (email, title, password) VALUES (?, ?, ?)";
    await connection.execute(insertQuery, [email, title, hashedPassword]);

    // Delete used code
    await connection.execute(`DELETE FROM staff_codes WHERE code = ?`, [code]);

    await connection.commit();
    res.status(201).json({
      message: "Mentor registered successfully and code deleted",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Error during mentor signup:", error);

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ message: "Email already exists" });
    }

    res.status(500).json({ message: "Signup failed" });
  } finally {
    connection.release();
  }
});


// ======= Hpcsa Signup Route ======= //
app.post('/api/hpcsa/signup', upload.single('hpcsa_signature'), async (req, res) => {
  const { hi_number, name, surname, email, password, contact } = req.body;
  const hpcsa_signature = req.file ? req.file.path : null;

  try {
    if (!hi_number || !name || !surname || !email || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Missing required fields' });
    }

    const [existing] = await pool.execute(
      'SELECT id FROM hpcsa_auditor WHERE email = ? OR hi_number = ?',
      [email, hi_number]
    );

    if (existing.length > 0) {
      return res
        .status(409)
        .json({ success: false, message: 'Email or HPCSA number already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const [result] = await pool.execute(
      `INSERT INTO hpcsa_auditor
         (hi_number, name, surname, email, password, contact, hpcsa_signature, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
      [hi_number, name, surname, email, hashedPassword, contact || null, hpcsa_signature]
    );

    res.status(201).json({
      success: true,
      message: 'HPCSA auditor registered successfully',
      auditorId: result.insertId
    });
  } catch (error) {
    console.error('Error in HPCSA signup:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


app.post("/api/signup", async (req, res) => {
  const { email, title, password, code } = req.body;

  if (!code) {
    return res.status(400).json({ message: "Signup code is required" });
  }

  const connection = await pool.getConnection(); // <-- add this line

  try {
    await connection.beginTransaction(); // <-- start transaction

    // First, validate if the code still exists
    const [rows] = await connection.execute(
      `SELECT * FROM signup_codes WHERE code = ?`,
      [code]
    );

    if (rows.length === 0) {
      await connection.rollback(); // <-- rollback if no code
      return res
        .status(400)
        .json({ message: "Invalid or expired signup code" });
    }

    // Proceed with user creation
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = "INSERT INTO users (email, title, password) VALUES (?, ?, ?)";
    await connection.execute(query, [email, title, hashedPassword]);

    // After successful signup, delete the code
    await connection.execute(`DELETE FROM signup_codes WHERE code = ?`, [code]);

    await connection.commit(); // <-- commit transaction

    res
      .status(201)
      .json({ message: "User registered successfully and code deleted" });
  } catch (error) {
    await connection.rollback(); // <-- rollback on error
    console.error("Error during signup:", error);
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ message: "Email already exists" });
    }
    res.status(500).json({ message: "Signup failed" });
  } finally {
    connection.release(); // <-- important to release connection
  }
});

// ======= Generate staff code ======= //
function generateStaffCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ======= Generate mentor code ======= //
function generateMentorCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}


// ======= Create staff code endpoint ======= //
app.post("/api/staff_codes", async (req, res) => {
  try {
    const { staff_name, staff_email } = req.body;

    // Validate input
    if (!staff_name || !staff_email) {
      return res.status(400).json({
        success: false,
        message: "Staff name and email are required",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(staff_email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Generate unique staff code
    let code;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!isUnique && attempts < maxAttempts) {
      code = generateStaffCode();
      const [existing] = await pool.query(
        "SELECT * FROM staff_codes WHERE code = ?",
        [code]
      );
      isUnique = existing.length === 0;
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({
        success: false,
        message: "Failed to generate unique staff code",
      });
    }

    // Insert into database
    const [result] = await pool.query(
      "INSERT INTO staff_codes (code, staff_name, staff_email) VALUES (?, ?, ?)",
      [code, staff_name, staff_email]
    );

    // Send email with the staff code
    await sendStaffCodeEmail(staff_email, staff_name, code);

    res.status(201).json({
      success: true,
      message: "Staff code created and sent via email",
      data: {
        code,
      },
    });
  } catch (error) {
    console.error("Error creating staff code:", error);

    // Check if the error is from email sending
    if (error.message === "Status updated but failed to send email") {
      res.status(201).json({
        success: true,
        message: "Staff code created but email failed to send",
        data: {
          code,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
});


// =======++   Email sending function for staff codes ======= //
async function sendStaffCodeEmail(to, staffName, code) {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: to,
    subject: "Your Staff Registration Code",
    text:
      `Dear ${staffName},\n\n` +
      `Your staff registration code has been successfully generated.\n\n` +
      `Your staff code is: ${code}\n\n` +
      `Please use this code to complete your registration on our system.\n\n` +
      `Best regards,\n` +
      `MUT FACULTY OF NATURAL SCIENCES: DEPARTMENT OF ENVIRONMENTAL HEALTH`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Staff code email sent to ${to}`);
  } catch (emailError) {
    console.error("Error sending staff code email:", emailError);
    throw new Error("Status updated but failed to send email");
  }
}

// =======  Validate staff code ======= //
// Make sure this is added to your Express app routes
app.post("/api/validate-staff-code", async (req, res) => {
  const { code } = req.body;

  // Debug: Log the incoming code
  console.log("Received staff code for validation:", code);

  if (!code) {
    console.log("Validation failed: No staff code provided");
    return res.status(400).json({
      success: false,
      message: "Staff code is required",
    });
  }

  try {
    // Debug: Log the database query
    console.log("Querying database for staff code:", code);

    const [rows] = await pool.execute(
      `SELECT * FROM  s 
       WHERE code = ?`,
      [code]
    );

    // Debug: Log the query results
    console.log("Database returned:", rows);

    if (rows.length === 0) {
      console.log("Validation failed: Staff code not found in database");
      return res.json({
        success: false,
        message: "Invalid staff code",
      });
    }

    const staffCodeEntry = rows[0];

    // Debug: Log the found staff code entry
    console.log("Found staff code entry:", {
      code: staffCodeEntry.code,
      name: staffCodeEntry.staff_name,
      email: staffCodeEntry.staff_email,
      created_at: staffCodeEntry.created_at,
    });

    console.log("Validation successful for staff code:", code);
    return res.json({
      success: true,
      message: "Valid staff code",
      data: {
        staff_name: staffCodeEntry.staff_name,
        staff_email: staffCodeEntry.staff_email,
      },
    });
  } catch (error) {
    console.error("Error validating staff code:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during staff code validation",
    });
  }
});

// ======= Student Login Route ======= //
app.post("/api/studentLogin", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Query the database for the user with the provided email
    const query = "SELECT * FROM student_users WHERE email = ?";
    const [results] = await pool.execute(query, [email]);

    // Check if the user exists
    if (results.length === 0) {
      return res.status(401).json({ message: "Student was not found" });
    }

    const user = results[0];

    // Compare the provided password with the hashed password in the database
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Store the user's email in the session (server-side)
    req.session.userEmail = user.email;

    // Return the user's email in the response
    res
      .status(200)
      .json({ message: "Student Logged in successful", email: user.email });
  } catch (error) {
    console.error("Error during student login:", error);
    res.status(500).json({ message: "Login failed" });
  }
});

// ======= Staff Login Route ======= //
app.post("/api/staffLogin", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Query the database for the user with the provided email
    const query = "SELECT * FROM staff_users WHERE email = ?";
    const [results] = await pool.execute(query, [email]);

    // Check if the user exists
    if (results.length === 0) {
      return res.status(401).json({ message: "Staff was not found" });
    }

    const user = results[0];

    // Compare the provided password with the hashed password in the database
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Store the user's email in the session (server-side)
    req.session.userEmail = user.email;

    // Return the user's email in the response
    res
      .status(200)
      .json({ message: "Staff logged in successful", email: user.email });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ message: "Login failed" });
  }
});

// ======= Mentor Login Route ======= //
app.post("/api/mentorLogin", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Query the database for the user with the provided email
    const query = "SELECT * FROM mentor_users WHERE email = ?";
    const [results] = await pool.execute(query, [email]);

    // Check if the user exists
    if (results.length === 0) {
      return res.status(401).json({ message: "Mentor was not found" });
    }

    const user = results[0];

    // Compare the provided password with the hashed password in the database
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Store the user's email in the session (server-side)
    req.session.userEmail = user.email;

    // Return the user's email in the response
    res
      .status(200)
      .json({ message: "Mentor logged in successful", email: user.email });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ message: "Login failed" });
  }
});


// ======= HPCSA Login Route ======= //
app.post("/api/hpcsa/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Query the database for the auditor with the provided email
    const query = "SELECT * FROM hpcsa_auditor WHERE email = ?";
    const [results] = await pool.execute(query, [email]);

    // Check if the auditor exists
    if (results.length === 0) {
      return res.status(401).json({ message: "Auditor was not found" });
    }

    const auditor = results[0];

    // Compare the provided password with the hashed password in the database
    const isMatch = await bcrypt.compare(password, auditor.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Store the auditor's email in the session (server-side)
    req.session.userEmail = auditor.email;

    // Return a simple success response with selected user info
    res.status(200).json({
      message: "Auditor logged in successfully",
      email: auditor.email,
      name: auditor.name,
      surname: auditor.surname,
      hi_number: auditor.hi_number,
      contact: auditor.contact,
      hpcsa_signature: auditor.hpcsa_signature
    });
  } catch (error) {
    console.error("Error during HPCSA login:", error);
    res.status(500).json({ message: "Login failed" });
  }
});


app.get("/api/students/current", authenticateToken, (req, res) => {
  try {
    const email = req.user.email;

    // Extract student number from the email prefix
    const studentNumber = email.split("@")[0];

    // Return it to the client
    res.json({ studentNumber });
  } catch (error) {
    console.error("Error extracting student number:", error);
    res.status(500).json({ message: "Failed to extract student number" });
  }
});

app.get("/api/mentor/current", authenticateToken, (req, res) => {
  try {
    const email = req.user.email;

    // Extract student number from the email prefix
    const studentNumber = email.split("@")[0];

    // Return it to the client
    res.json({ studentNumber });
  } catch (error) {
    console.error("Error extracting mentor number:", error);
    res.status(500).json({ message: "Failed to extract mentor number" });
  }
});

app.get("/api/hpcsa/current", authenticateToken, (req, res) => {
  try {
    const email = req.user.email;

    // Extract student number from the email prefix
    const studentNumber = email.split("@")[0];

    // Return it to the client
    res.json({ studentNumber });
  } catch (error) {
    console.error("Error extracting hpcsa number:", error);
    res.status(500).json({ message: "Failed to extract mentor number" });
  }
});

// ======= Logout Route ======= //
app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Could not log out" });
    }
    res.status(200).json({ message: "Logged out successfully" });
  });
});

// ======= Protected Route Example ======= //
app.get("/api/student-dashboard", (req, res) => {
  const userEmail = req.session.userEmail;
  res.status(200).json({ message: `Welcome, ${userEmail}` });
});

// ======= Submit Student Application ======= //
app.post(
  "/api/applications",
  upload.fields([
    { name: "signatureImage", maxCount: 1 },
    { name: "idDocument", maxCount: 1 },
    { name: "cvDocument", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        province,
        title,
        initials,
        surname,
        firstNames,
        studentNumber,
        levelOfStudy,
        race,
        gender,
        emailAddress,
        physicalAddress,
        homeTown,
        cellPhoneNumber,
        municipalityName,
        townSituated,
        contactPerson,
        contactEmail,
        telephoneNumber,
        contactCellPhone,
        declarationInfo1,
        declarationInfo2,
        declarationInfo3,
      } = req.body;

      if (
        !req.files ||
        !req.files["signatureImage"] ||
        !req.files["idDocument"] ||
        !req.files["cvDocument"]
      ) {
        return res
          .status(400)
          .json({ message: "All file uploads are required" });
      }

      const signaturePath = path.join(
        "uploads",
        req.files["signatureImage"][0].filename
      );
      const idDocPath = path.join(
        "uploads",
        req.files["idDocument"][0].filename
      );
      const cvPath = path.join("uploads", req.files["cvDocument"][0].filename);

      const query = `
        INSERT INTO wil_application (
          province, title, initials, surname, first_names, student_number, level_of_study,
          race, gender, email, physical_address, home_town, cell_phone_number,
          municipality_name, town_situated, contact_person, contact_email, telephone_number,
          contact_cell_phone, declaration_info_1, declaration_info_2, declaration_info_3,
          signature_image, id_document, cv_document
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const values = [
        province,
        title,
        initials,
        surname,
        firstNames,
        studentNumber,
        levelOfStudy,
        race,
        gender,
        emailAddress,
        physicalAddress,
        homeTown,
        cellPhoneNumber,
        municipalityName,
        townSituated,
        contactPerson,
        contactEmail,
        telephoneNumber,
        contactCellPhone,
        declarationInfo1 === "true" || declarationInfo1 === true,
        declarationInfo2 === "true" || declarationInfo2 === true,
        declarationInfo3 === "true" || declarationInfo3 === true,
        signaturePath,
        idDocPath,
        cvPath,
      ];

      const [result] = await pool.execute(query, values);

      res.status(201).json({
        message: "Student application submitted successfully.",
        applicationId: result.insertId,
      });
    } catch (error) {
      console.error("Error submitting application:", error);
      res.status(500).json({ message: "Failed to submit application" });
    }
  }
);

// ======= check for existing logsheets  ======= //
app.get("/api/check-logsheet/:student_number/:log_date", async (req, res) => {
  try {
    const { student_number, log_date } = req.params;

    // Simple validation
    if (!student_number || !log_date || !/^\d{4}-\d{2}-\d{2}$/.test(log_date)) {
      return res.status(400).json({
        message: "Invalid parameters",
        details: {
          student_number,
          log_date,
        },
      });
    }

    const [rows] = await pool.execute(
      `SELECT 1 FROM daily_logsheet 
       WHERE student_number = ? AND log_date = ?`,
      [student_number, log_date]
    );

    res.status(200).json({
      exists: rows.length > 0,
    });
  } catch (error) {
    console.error("Error checking logsheet:", error);
    res.status(500).json({
      message: "Failed to check logsheet",
      error: error.message,
    });
  }
});

// ======= get for existing logsheets for file ======= //
app.get("/api/get-logsheet/:student_number", async (req, res) => {
  try {
    const { student_number } = req.params;

    if (!student_number) {
      return res.status(400).json({
        message: "Student number is required",
      });
    }

    const [rows] = await pool.execute(
      `SELECT * FROM daily_logsheet 
       WHERE student_number = ?
       ORDER BY log_date DESC`,
      [student_number]
    );

    if (rows.length === 0) {
      return res.status(200).json({
        exists: false,
        logsheets: [],
      });
    }

    const logsheets = rows.map((logsheet) => {
      const activities = [];

      for (let i = 1; i <= 14; i++) {
        const activityKey = `activity${i}`;
        const hoursKey = `hours${i}`;

        if (logsheet[activityKey]) {
          activities.push({
            name: logsheet[activityKey],
            hours: parseFloat(logsheet[hoursKey]) || 0,
          });
        }
      }

      return {
        id: logsheet.id, // Include the ID here
        log_date: logsheet.log_date,
        activities,
        student_signature: logsheet.student_signature,
        supervisor_signature: logsheet.supervisor_signature,
        // Include any other fields you need
      };
    });

    res.status(200).json({
      exists: true,
      logsheets,
    });
  } catch (error) {
    console.error("Error fetching logsheets:", error);
    res.status(500).json({
      message: "Failed to fetch logsheets",
      error: error.message,
    });
  }
});

// ======= Get Student logsheet using student Number ======= //
app.get("/api/check-logsheet/:student_number", async (req, res) => {
  try {
    const { student_number } = req.params;

    // Validate student number
    if (!student_number) {
      return res.status(400).json({
        message: "Student number is required",
      });
    }

    // Fetch all logsheets for this student
    const [rows] = await pool.execute(
      `SELECT * FROM daily_logsheet 
       WHERE student_number = ?
       ORDER BY log_date DESC`,
      [student_number]
    );

    if (rows.length === 0) {
      return res.status(200).json({
        exists: false,
        logsheets: [],
      });
    }

    // Process each logsheet and extract activities
    const logsheets = rows.map((logsheet) => {
      const activities = [];

      for (let i = 1; i <= 14; i++) {
        const activityKey = `activity${i}`;
        const hoursKey = `hours${i}`;

        if (logsheet[activityKey]) {
          activities.push({
            name: logsheet[activityKey],
            hours: parseFloat(logsheet[hoursKey]) || 0,
          });
        }
      }

      return {
        log_date: logsheet.log_date,
        activities,
      };
    });

    res.status(200).json({
      exists: true,
      logsheets,
    });
  } catch (error) {
    console.error("Error fetching logsheets:", error);
    res.status(500).json({
      message: "Failed to fetch logsheets",
      error: error.message,
    });
  }
});

// ======= Submit Daily Log Sheet ======= //
// Create Daily Log Sheet
app.post(
  "/api/submit-logsheet",
  upload.fields([
    { name: "student_signature", maxCount: 1 },
    { name: "supervisor_signature", maxCount: 1 },
    { name: "date_stamp", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      // First check if logsheet already exists
      const { student_number, log_date } = req.body;
      const [existing] = await pool.execute(
        `SELECT id FROM daily_logsheet 
         WHERE student_number = ? AND log_date = ?`,
        [student_number, log_date]
      );

      if (existing.length > 0) {
        return res.status(400).json({
          message: "A logsheet already exists for this student and date",
          logsheetId: existing[0].id,
        });
      }
      // Validate required fields
      const requiredFields = ["log_date", "student_number", "EHP_HI_Number"];
      const missingFields = requiredFields.filter((field) => !req.body[field]);

      if (missingFields.length > 0) {
        return res.status(400).json({
          message: `Missing required fields: ${missingFields.join(", ")}`,
          details: {
            receivedFields: Object.keys(req.body),
            missingFields,
          },
        });
      }

      // Check if at least one activity is provided
      let hasActivities = false;
      for (let i = 1; i <= 14; i++) {
        if (req.body[`activity${i}`]) {
          hasActivities = true;
          break;
        }
      }

      if (!hasActivities) {
        return res.status(400).json({
          message: "At least one activity must be provided",
        });
      }

      // Handle file uploads safely
      const files = req.files || {};
      const studentSignature =
        files["student_signature"]?.[0]?.filename ||
        req.body.student_signature ||
        null;
      const supervisorSignature =
        files["supervisor_signature"]?.[0]?.filename ||
        req.body.supervisor_signature ||
        null;
      const dateStamp =
        files["date_stamp"]?.[0]?.filename || req.body.date_stamp || null;

      // SQL query
      const sql = `
        INSERT INTO daily_logsheet (
          log_date,
          student_number,
          EHP_HI_Number,
          activity1, hours1,
          activity2, hours2,
          activity3, hours3,
          activity4, hours4,
          activity5, hours5,
          activity6, hours6,
          activity7, hours7,
          activity8, hours8,
          activity9, hours9,
          activity10, hours10,
          activity11, hours11,
          activity12, hours12,
          activity13, hours13,
          activity14, hours14,
          description,
          situation_description,
          situation_evaluation,
          situation_interpretation,
          student_signature,
          supervisor_signature,
          date_stamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      // Prepare values
      const values = [
        req.body.log_date,
        req.body.student_number,
        req.body.EHP_HI_Number || null,
        req.body.activity1 || null,
        req.body.hours1 || null,
        req.body.activity2 || null,
        req.body.hours2 || null,
        req.body.activity3 || null,
        req.body.hours3 || null,
        req.body.activity4 || null,
        req.body.hours4 || null,
        req.body.activity5 || null,
        req.body.hours5 || null,
        req.body.activity6 || null,
        req.body.hours6 || null,
        req.body.activity7 || null,
        req.body.hours7 || null,
        req.body.activity8 || null,
        req.body.hours8 || null,
        req.body.activity9 || null,
        req.body.hours9 || null,
        req.body.activity10 || null,
        req.body.hours10 || null,
        req.body.activity11 || null,
        req.body.hours11 || null,
        req.body.activity12 || null,
        req.body.hours12 || null,
        req.body.activity13 || null,
        req.body.hours13 || null,
        req.body.activity14 || null,
        req.body.hours14 || null,
        req.body.description || null,
        req.body.situation_description || null,
        req.body.situation_evaluation || null,
        req.body.situation_interpretation || null,
        studentSignature, // Can be either uploaded file or base64 string
        supervisorSignature, // Can be either uploaded file or base64 string
        dateStamp, // Can be either uploaded file or base64 string
      ];

      await pool.execute(sql, values);

      res.status(200).json({
        message: "Log sheet submitted successfully",
        data: {
          log_date: req.body.log_date,
          student_number: req.body.student_number,
          EHP_HI_Number: req.body.EHP_HI_Number || null,
          activities: Array(14)
            .fill()
            .map((_, i) => ({
              activity: req.body[`activity${i + 1}`],
              hours: req.body[`hours${i + 1}`],
            }))
            .filter((a) => a.activity),
        },
      });
    } catch (error) {
      console.error("Error submitting log sheet:", error);
      res.status(500).json({
        message: "Failed to submit log sheet",
        error: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
    }
  }
);

// ======= Delete Daily Log Sheet ======= //
app.delete("/api/delete-logsheets/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Verify logsheet exists
    const [rows] = await pool.execute(
      "SELECT student_signature, supervisor_signature FROM daily_logsheet WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Logsheet not found." });
    }

    const logsheet = rows[0];

    // Delete associated signature files
    if (logsheet.student_signature) {
      const studentSigPath = path.join(
        __dirname,
        "uploads",
        logsheet.student_signature
      );
      if (fs.existsSync(studentSigPath)) {
        fs.unlinkSync(studentSigPath);
      }
    }

    if (logsheet.supervisor_signature) {
      const supervisorSigPath = path.join(
        __dirname,
        "uploads",
        logsheet.supervisor_signature
      );
      if (fs.existsSync(supervisorSigPath)) {
        fs.unlinkSync(supervisorSigPath);
      }
    }

    // Delete from database
    await pool.execute("DELETE FROM daily_logsheet WHERE id = ?", [id]);

    res.status(200).json({ message: "Logsheet deleted successfully." });
  } catch (error) {
    console.error("Error deleting logsheet:", error);
    res.status(500).json({ message: "Failed to delete logsheet." });
  }
});

// ======= Get All Student Applications by Email ======= //
app.get("/api/student_applications", async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ message: "Missing student email" });
  }

  try {
    const [rows] = await pool.execute(
      "SELECT * FROM wil_application WHERE email = ? ORDER BY created_at DESC",
      [email]
    );

    const applications = rows.map((row) => ({
      ...row,
      signature_image: `http://localhost:${port}/${row.signature_image}`,
      id_document: `http://localhost:${port}/${row.id_document}`,
      cv_document: `http://localhost:${port}/${row.cv_document}`,
    }));

    res.status(200).json(applications);
  } catch (error) {
    console.error("Error fetching student applications:", error);
    res.status(500).json({ message: "Failed to retrieve applications." });
  }
});

// ======= Get Latest Student Application by Email ======= //
app.get("/api/application-by-email", async (req, res) => {
  const email = req.query.email;

  if (!email) {
    return res.status(400).json({ message: "Email query parameter is required." });
  }

  try {
    // Fetch the most recent application for the student
    const [rows] = await pool.execute(
      `SELECT * FROM wil_application 
       WHERE email = ? 
       ORDER BY created_at DESC 
       LIMIT 1`, // Order by newest first
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "No applications found for this email." });
    }

    const latestApplication = rows[0];
    console.log("Latest application data:", latestApplication); // Debug log

    // Generate document URLs if they exist
    if (latestApplication.signature_image) {
      latestApplication.signature_image = `http://localhost:${port}/${latestApplication.signature_image}`;
    }
    if (latestApplication.id_document) {
      latestApplication.id_document = `http://localhost:${port}/${latestApplication.id_document}`;
    }
    if (latestApplication.cv_document) {
      latestApplication.cv_document = `http://localhost:${port}/${latestApplication.cv_document}`;
    }

    res.status(200).json(latestApplication);
  } catch (error) {
    console.error("Error fetching latest application:", error);
    res.status(500).json({ message: "Failed to retrieve application." });
  }
});


// ======= Update Student Application ======= //
app.put('/api/applications/update', upload.fields([
  { name: 'signatureImage', maxCount: 1 },
  { name: 'idDocument', maxCount: 1 },
  { name: 'cvDocument', maxCount: 1 }
]), async (req, res) => {
  try {
    const email = req.body.email;
    const formData = { ...req.body };
    const files = req.files;

    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    // Get existing application data
    const [existingApp] = await pool.execute(
      'SELECT * FROM wil_application WHERE email = ?',
      [email]
    );

    if (existingApp.length === 0) {
      return res.status(404).json({ message: "Application not found." });
    }

    const existingData = existingApp[0];

    // Handle file paths: prefer uploaded file, then fallback to existing form value
    const signatureImage = files?.signatureImage?.[0]?.path || formData.signatureImage || existingData.signature_image;
    const idDocument = files?.idDocument?.[0]?.path || formData.idDocument || existingData.id_document;
    const cvDocument = files?.cvDocument?.[0]?.path || formData.cvDocument || existingData.cv_document;

    // Convert string 'true'/'false' or booleans to integers for MySQL (1 or 0)
    const declarations = {
      declaration_info1: formData.declarationInfo1 === 'true' || formData.declarationInfo1 === true ? 1 : existingData.declaration_info1,
      declaration_info2: formData.declarationInfo2 === 'true' || formData.declarationInfo2 === true ? 1 : existingData.declaration_info2,
      declaration_info3: formData.declarationInfo3 === 'true' || formData.declarationInfo3 === true ? 1 : existingData.declaration_info3
    };

    // Build dynamic update query based on what's provided in the form
    const updateFields = [];
    const updateValues = [];

    // Helper function to add field if it exists in formData and is different from existing
    const addFieldIfChanged = (fieldName, dbFieldName = null) => {
      dbFieldName = dbFieldName || fieldName;
      if (formData[fieldName] !== undefined && formData[fieldName] !== existingData[dbFieldName]) {
        updateFields.push(`${dbFieldName} = ?`);
        updateValues.push(formData[fieldName] || null);
      }
    };

    // Add all possible fields
    addFieldIfChanged('province');
    addFieldIfChanged('title');
    addFieldIfChanged('initials');
    addFieldIfChanged('surname');
    addFieldIfChanged('firstNames', 'first_names');
    addFieldIfChanged('studentNumber', 'student_number');
    addFieldIfChanged('levelOfStudy', 'level_of_study');
    addFieldIfChanged('race');
    addFieldIfChanged('gender');
    addFieldIfChanged('emailAddress', 'email');
    addFieldIfChanged('physicalAddress', 'physical_address');
    addFieldIfChanged('cellPhoneNumber', 'cell_phone_number');
    addFieldIfChanged('homeTown', 'home_town');
    addFieldIfChanged('municipalityName', 'municipality_name');
    addFieldIfChanged('townSituated', 'town_situated');
    addFieldIfChanged('contactPerson', 'contact_person');
    addFieldIfChanged('contactEmail', 'contact_email');
    addFieldIfChanged('telephoneNumber', 'telephone_number');
    addFieldIfChanged('contactCellPhone', 'contact_cell_phone');

    // Add declarations if changed
    if (formData.declarationInfo1 !== undefined && declarations.declaration_info1 !== existingData.declaration_info1) {
      updateFields.push('declaration_info_1 = ?');
      updateValues.push(declarations.declaration_info1);
    }
    if (formData.declarationInfo2 !== undefined && declarations.declaration_info2 !== existingData.declaration_info2) {
      updateFields.push('declaration_info_2 = ?');
      updateValues.push(declarations.declaration_info2);
    }
    if (formData.declarationInfo3 !== undefined && declarations.declaration_info3 !== existingData.declaration_info3) {
      updateFields.push('declaration_info_3 = ?');
      updateValues.push(declarations.declaration_info3);
    }

    // Add files if changed
    if (signatureImage !== existingData.signature_image) {
      updateFields.push('signature_image = ?');
      updateValues.push(signatureImage);
    }
    if (idDocument !== existingData.id_document) {
      updateFields.push('id_document = ?');
      updateValues.push(idDocument);
    }
    if (cvDocument !== existingData.cv_document) {
      updateFields.push('cv_document = ?');
      updateValues.push(cvDocument);
    }

    // If nothing to update
    if (updateFields.length === 0) {
      return res.status(200).json({ message: "No changes detected." });
    }

    // Always update the updated_at field
    updateFields.push('updated_at = NOW()');

    const query = `UPDATE wil_application SET ${updateFields.join(', ')} WHERE email = ?`;
    updateValues.push(email);

    await pool.execute(query, updateValues);

    // Clean up old files if new ones were uploaded
    if (files?.signatureImage && existingData.signature_image) {
      fs.unlink(existingData.signature_image, () => {});
    }
    if (files?.idDocument && existingData.id_document) {
      fs.unlink(existingData.id_document, () => {});
    }
    if (files?.cvDocument && existingData.cv_document) {
      fs.unlink(existingData.cv_document, () => {});
    }

    res.status(200).json({ message: "Application updated successfully!" });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ message: "Failed to update application. Please try again." });
  }
});

// ======= Get All Student Application ======= //
app.get("/api/get-applications", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM wil_application ORDER BY created_at DESC");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ======= Delete a student's application form ======= //
app.delete("/api/delete-application/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch the application to get file paths
    const [rows] = await pool.execute(
      "SELECT signature_image, id_document, cv_document FROM wil_application WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Application not found." });
    }

    const app = rows[0];

    // Delete associated files if they exist
    const fileFields = ["signature_image", "id_document", "cv_document"];
    fileFields.forEach((field) => {
      if (app[field]) {
        const filePath = path.join(__dirname, app[field]);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    });

    // First, delete related event_attendance records to avoid foreign key constraint errors
    await pool.execute("DELETE FROM event_attendance WHERE student_id = ?", [id]);

    // Delete from database
    await pool.execute("DELETE FROM wil_application WHERE id = ?", [id]);

    res.status(200).json({ message: "Application deleted successfully." });
  } catch (error) {
    console.error("Error deleting application:", error);
    res.status(500).json({ message: "Failed to delete application." });
  }
});



// ======= Get All Daily Log Sheets ======= //
app.get("/api/daily-logsheets", async (req, res) => {
  try {
    // Fetch all rows from the daily_logsheet table
    const [rows] = await pool.execute(
      "SELECT * FROM daily_logsheet ORDER BY log_date DESC"
    );

    // Map the rows and filter out null values for each log sheet
    const logSheets = rows.map((row) => {
      const filteredRow = {};

      // Iterate through each key-value pair in the row
      for (const key in row) {
        // Skip null/undefined values except for special fields
        if (row[key] !== null && row[key] !== undefined) {
          // Handle special fields
          if (key === "student_signature" || key === "supervisor_signature") {
            // Only include signature URLs if file exists
            if (row[key]) {
              filteredRow[key] = `http://localhost:${port}/uploads/${row[key]}`;
            }
          }
          // Skip null activities and hours
          else if (key.startsWith("activity") || key.startsWith("hours")) {
            if (row[key] !== null) {
              filteredRow[key] = row[key];
            }
          }
          // Include all other non-null fields
          else {
            filteredRow[key] = row[key];
          }
        }
      }

      return filteredRow;
    });

    // Send the filtered log sheets as a JSON response
    res.status(200).json(logSheets);
  } catch (error) {
    console.error("Error fetching daily log sheets:", error);
    res.status(500).json({ message: "Failed to retrieve daily log sheets." });
  }
});

app.get("/api/logbook", async (req, res) => {
  try {
    // Get student_number from query parameters
    const { student_number } = req.query;

    if (!student_number) {
      return res.status(400).json({ message: "Student number is required" });
    }

    // Fetch only rows matching the student_number
    const [rows] = await pool.execute(
      "SELECT * FROM daily_logsheet WHERE student_number = ? ORDER BY log_date DESC",
      [student_number]
    );

    // Map the rows and filter out null values for each log sheet
    const logSheets = rows.map((row) => {
      const filteredRow = {};

      // Iterate through each key-value pair in the row
      for (const key in row) {
        // Skip null/undefined values except for special fields
        if (row[key] !== null && row[key] !== undefined) {
          // Handle special fields
          if (key === "student_signature" || key === "supervisor_signature") {
            // Only include signature URLs if file exists
            if (row[key]) {
              filteredRow[key] = `http://localhost:${port}/uploads/${row[key]}`;
            }
          }
          // Skip null activities and hours
          else if (key.startsWith("activity") || key.startsWith("hours")) {
            if (row[key] !== null) {
              filteredRow[key] = row[key];
            }
          }
          // Include all other non-null fields
          else {
            filteredRow[key] = row[key];
          }
        }
      }

      return filteredRow;
    });

    // Send the filtered log sheets as a JSON response
    res.status(200).json(logSheets);
  } catch (error) {
    console.error("Error fetching daily log sheets:", error);
    res.status(500).json({
      message: "Failed to retrieve daily log sheets.",
      error: error.message,
    });
  }
});

// ======= Update Daily Log Sheet ======= //
app.put(
  "/api/update-logsheets/:id",
  upload.fields([
    { name: "student_signature" },
    { name: "supervisor_signature" },
  ]),
  async (req, res) => {
    const { id } = req.params;

    // Only get the fields we actually want to update
    const { EHP_HI_Number } = req.body;

    // Handle file uploads
    const supervisor_signature = req.files["supervisor_signature"]
      ? req.files["supervisor_signature"][0].filename
      : null;

    try {
      // Build dynamic update query
      const updateFields = [];
      const params = [];

      if (EHP_HI_Number) {
        updateFields.push("EHP_HI_Number = ?");
        params.push(EHP_HI_Number);
      }

      if (supervisor_signature) {
        updateFields.push("supervisor_signature = ?");
        params.push(supervisor_signature);
      }

      // Add updated_at timestamp
      updateFields.push("created_at = CURRENT_TIMESTAMP");

      // If no valid fields to update
      if (updateFields.length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      const query = `UPDATE daily_logsheet 
        SET ${updateFields.join(", ")} 
        WHERE id = ?`;

      params.push(id);

      const [result] = await pool.execute(query, params);

      res.status(200).json({ message: "Logsheet updated successfully!" });
    } catch (error) {
      console.error("Update error:", error);
      res.status(500).json({ error: "Failed to update logsheet" });
    }
  }
);

// ======= Sign and update a logsheet =======//
app.put(
  "/api/sign-logsheets/:id",
  upload.fields([
    { name: "supervisor_signature", maxCount: 1 },
    { name: "EHP_HI_Number", maxCount: 1 },
  ]),
  async (req, res) => {
    const { id } = req.params;

    // Debug logs
    console.log("Request Body:", req.body);
    console.log("Files received:", req.files);

    const supervisor_signature =
      req.files["supervisor_signature"]?.[0]?.filename || null;
    const { ehp_hi_number } = req.body;

    console.log("Parsed Fields:", { ehp_hi_number, supervisor_signature });

    // Prepare dynamic SQL query
    let setClause = [];
    let params = [];

    if (ehp_hi_number) {
      setClause.push("EHP_HI_Number = ?");
      params.push(ehp_hi_number);
    }
    if (supervisor_signature) {
      setClause.push("supervisor_signature = ?");
      params.push(supervisor_signature);
    }

    setClause.push("created_at = NOW()");
    params.push(id);

    const query = `UPDATE daily_logsheet SET ${setClause.join(
      ", "
    )} WHERE id = ?`;

    try {
      const [result] = await pool.execute(query, params);

      console.log("Update Result:", {
        affectedRows: result.affectedRows,
        changedRows: result.changedRows,
      });

      if (result.affectedRows === 0) {
        return res.status(404).json({
          error: "No record updated - ID may not exist",
          attemptedId: id,
        });
      }

      res.status(200).json({
        success: true,
        message: "Logsheet updated successfully!",
        changes: result.affectedRows,
        signatureFile: supervisor_signature,
      });
    } catch (error) {
      console.error("Full Error:", {
        message: error.message,
        code: error.code,
        sqlState: error.sqlState,
        sqlMessage: error.sqlMessage,
        stack: error.stack,
      });
      res.status(500).json({
        error: "Database update failed",
        details: {
          code: error.code,
          sqlState: error.sqlState,
          message: error.sqlMessage || error.message,
        },
      });
    }
  }
);

// ======= One  Get existing logsheet
app.get("/api/get-logsheet/:student_number/:log_date", async (req, res) => {
  try {
    const { student_number, log_date } = req.params;

    const [rows] = await pool.execute(
      `SELECT * FROM daily_logsheet 
       WHERE student_number = ? AND log_date = ? ORDER BY created_at DESC LIMIT 1`,
      [student_number, log_date]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Logsheet not found" });
    }

    res.status(200).json(rows[0]);
  } catch (error) {
    console.error("Error fetching logsheet:", error);
    res
      .status(500)
      .json({ message: "Failed to fetch logsheet", error: error.message });
  }
});

// ======= One Update logsheet ======= //
app.put(
  "/api/update-logsheet",
  upload.fields([
    { name: "student_signature", maxCount: 1 },
    { name: "supervisor_signature", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        student_number,
        log_date,
        description,
        situation_description,
        situation_evaluation,
        situation_interpretation,
        date_stamp,
      } = req.body;

      // Verify logsheet exists
      const [existing] = await pool.execute(
        `SELECT id FROM daily_logsheet 
         WHERE student_number = ? AND log_date = ?`,
        [student_number, log_date]
      );

      if (existing.length === 0) {
        return res.status(404).json({ message: "Logsheet not found" });
      }

      // Build dynamic update query
      let updateQuery = `UPDATE daily_logsheet SET 
        description = ?,
        situation_description = ?,
        situation_evaluation = ?,
        situation_interpretation = ?,
        date_stamp = ?`;

      const values = [
        description,
        situation_description,
        situation_evaluation,
        situation_interpretation,
        date_stamp,
      ];

      // Handle activities
      for (let i = 1; i <= 14; i++) {
        if (req.body[`activity${i}`]) {
          updateQuery += `, activity${i} = ?, hours${i} = ?`;
          values.push(req.body[`activity${i}`], req.body[`hours${i}`] || 0);
        }
      }

      // Handle signatures
      if (req.files["student_signature"]) {
        updateQuery += `, student_signature = ?`;
        values.push(req.files["student_signature"][0].filename);
      }

      updateQuery += ` WHERE id = ?`;
      values.push(existing[0].id);

      await pool.execute(updateQuery, values);

      res.status(200).json({ message: "Logsheet updated successfully" });
    } catch (error) {
      console.error("Error updating logsheet:", error);
      res.status(500).json({
        message: "Failed to update logsheet",
        error: error.message,
      });
    }
  }
);

// ======= UPDATE WIL APPLICATION STATUS ======= //
// Generate random 8-character code
function generateCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

// Email sending functions
async function sendAcceptanceEmail(to, firstName, code) {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: to,
    subject: "Your Application Has Been Successfully Accepted",
    text:
      `Dear ${firstName},\n\n` +
      `Congratulations! Your Student Application Form For Work Integration Learning Placements has been accepted.\n\n` +
      `Your registration code is: ${code}\n\n` +
      `Please use this code to signup on our system.\n\n` +
      `Best regards,\n` +
      `MUT FACULTY OF NATURAL SCIENCES: DEPARTMENT OF ENVIRONMENTAL HEALTH`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Acceptance email sent to ${to}`);
  } catch (emailError) {
    console.error("Error sending acceptance email:", emailError);
    throw new Error("Status updated but failed to send email");
  }
}

async function sendRejectionEmail(to, firstName) {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: to,
    subject: "Your Application Been unfortunately Rejected",
    text:
      `Dear ${firstName},\n\n` +
      `We regret to inform you that your student application form for Work Integration Learning Placements has not been accepted.\n\n` +
      `We encourage you to apply again in the future.\n\n` +
      `Best regards,\n` +
      `MUT FACULTY OF NATURAL SCIENCES: DEPARTMENT OF ENVIRONMENTAL HEALTH`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Rejection email sent to ${to}`);
  } catch (emailError) {
    console.error("Error sending rejection email:", emailError);
    throw new Error("Status updated but failed to send email");
  }
}

function generateRandomCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

// ======= UPDATE WIL APPLICATION STATUS ======= //
app.put("/api/update-status/:id", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  console.log(`Updating status for application ${id} to ${status}`);

  // Validate input
  if (!status || !["Pending", "Accepted", "Rejected"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid status value",
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. Get application details
    const [application] = await connection.execute(
      `SELECT id, first_names, surname, email, student_number, level_of_study 
       FROM wil_application 
       WHERE id = ?`,
      [id]
    );

    if (application.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    const appData = application[0];

    // 2. Update status
    const [updateResult] = await connection.execute(
      `UPDATE wil_application 
       SET status = ?, updated_at = NOW() 
       WHERE id = ?`,
      [status, id]
    );

    if (updateResult.affectedRows === 0) {
      await connection.rollback();
      return res.status(500).json({
        success: false,
        message: "No rows were updated",
      });
    }

    // 3. If Accepted, generate code, store it, and send email
    let generatedCode = null;
    if (status === "Accepted") {
      generatedCode = generateRandomCode();

      // Store code
      await connection.execute(
        `INSERT INTO signup_codes 
         (application_id, code, first_names, surname, student_number, level_of_study, email) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          generatedCode,
          appData.first_names,
          appData.surname,
          appData.student_number,
          appData.level_of_study,
          appData.email,
        ]
      );

      // Send email
      await sendAcceptanceEmail(
        appData.email,
        appData.first_names,
        generatedCode
      );
    } else if (status === "Rejected") {
      // Send rejection email
      await sendRejectionEmail(appData.email, appData.first_names);
    }

    await connection.commit();

    res.status(200).json({
      success: true,
      message: "Status updated successfully",
      newStatus: status,
      code: generatedCode,
      changes: updateResult.affectedRows,
    });
  } catch (error) {
    console.error("Database error:", error);
    if (connection) await connection.rollback();

    res.status(500).json({
      success: false,
      message: "Database operation failed",
      errorDetails: error.message,
    });
  } finally {
    if (connection) connection.release();
  }
});

// Validate signup code API
app.post("/api/validate-signup-code", async (req, res) => {
  const { code } = req.body;

  // Debug: Log the incoming code
  console.log("Received code for validation:", code);

  if (!code) {
    console.log("Validation failed: No code provided");
    return res.status(400).json({
      success: false,
      message: "Code is required",
    });
  }

  try {
    // Debug: Log the database query
    console.log("Querying database for code:", code);

    const [rows] = await pool.execute(
      `SELECT s.*, 
       (SELECT 1 FROM blocked_signups WHERE email = s.email LIMIT 1) AS is_blocked
       FROM signup_codes s 
       WHERE s.code = ?`,
      [code]
    );

    // Debug: Log the query results
    console.log("Database returned:", rows);

    if (rows.length === 0) {
      console.log("Validation failed: Code not found in database");
      return res.json({
        success: false,
        message: "Invalid code",
      });
    }

    const codeEntry = rows[0];

    // Debug: Log the found code entry
    console.log("Found code entry:", {
      code: codeEntry.code,
      email: codeEntry.email,
      is_blocked: codeEntry.is_blocked,
    });

    if (codeEntry.is_blocked) {
      console.log("Validation failed: Email is blocked");
      return res.json({
        success: false,
        message: "This email is blocked from signing up",
      });
    }

    console.log("Validation successful for code:", code);
    return res.json({
      success: true,
      message: "Valid code",
    });
  } catch (error) {
    console.error("Error validating code:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during validation",
    });
  }
});

// Block the signup email after 3 failed attempts
app.post("/api/block-signup-email", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email is required",
    });
  }

  try {
    // Insert into blocked_signups table
    const [result] = await pool.execute(
      "INSERT INTO blocked_signups (email) VALUES (?)",
      [email]
    );

    // Successfully blocked the email
    return res.status(200).json({
      success: true,
      message: "Email has been blocked",
    });
  } catch (error) {
    console.error("Error blocking email:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// Add guest lecture
// POST endpoint
app.post("/api/guest-lectures", upload.single("document"), async (req, res) => {
  try {
    const {
      title,
      guest_name,
      event_type,
      event_date,
      register_status, // ✅ New field
    } = req.body;

    if (!title || !guest_name || !event_type || !event_date || !register_status) {
      return res.status(400).json({
        message: "Title, Guest name, event type, date, and register status are required",
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Document is required" });
    }

    const document_path = `uploads/${req.file.filename}`;
    const created_by = req.user?.id || 1;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.execute(
        `INSERT INTO guest_lectures 
          (title, guest_name, event_type, event_date, register_status, document_path, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          title,
          guest_name,
          event_type,
          new Date(event_date),
          register_status,          // ✅ Include in query params
          document_path,
          created_by,
        ]
      );

      await connection.commit();
      res.status(201).json({
        message: "Event created successfully",
        documentPath: document_path,
      });
    } catch (err) {
      await connection.rollback();
      fs.unlinkSync(req.file.path);
      console.error("Database error:", err);
      res.status(500).json({ message: "Database operation failed" });
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ======= Get All Guest Lectures ======= //
app.get("/api/upcoming-events", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM guest_lectures ORDER BY event_date DESC"
    );

    const lectures = rows.map((lecture) => ({
      id: lecture.id,
      title: lecture.title,
      guest_name: lecture.guest_name,
      event_type: lecture.event_type,
      event_date: lecture.event_date.toISOString().split("T")[0], // Format date
      document_path: lecture.document_path,
      register_status: lecture.register_status || 'Not Set', // ✅ Include this line
    }));

    res.status(200).json({
      success: true,
      message: "Guest lectures retrieved successfully",
      data: lectures,
    });
  } catch (err) {
    console.error("Database error retrieving guest lectures:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Toggle the register_status of a guest lecture by ID
app.put("/api/guest-lecture/toggle-status/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Step 1: Get current status
    const [rows] = await pool.execute(
      "SELECT register_status FROM guest_lectures WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Lecture not found" });
    }

    const currentStatus = rows[0].register_status;
    const newStatus = currentStatus === "active" ? "inactive" : "active";

    // Step 2: Update the status
    await pool.execute(
      "UPDATE guest_lectures SET register_status = ? WHERE id = ?",
      [newStatus, id]
    );

    res.status(200).json({
      success: true,
      message: `Lecture status toggled to '${newStatus}'`,
      newStatus,
    });
  } catch (error) {
    console.error("Error toggling register_status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});


// ======= Get Guest Lecture by ID ======= //
app.delete("/api/delete-event/:id", async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "ID is required",
    });
  }

  try {
    // Fetch the record to get the document path
    const [rows] = await pool.execute(
      "SELECT document_path FROM guest_lectures WHERE id = ?",
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Record not found",
      });
    }

    const documentPath = rows[0].document_path;

    // Delete the record
    await pool.execute("DELETE FROM guest_lectures WHERE id = ?", [id]);

    // Delete the associated file from the server
    if (documentPath && fs.existsSync(documentPath)) {
      fs.unlinkSync(documentPath);
    }

    res.status(200).json({
      success: true,
      message: "Guest lecture deleted successfully",
    });
  } catch (err) {
    console.error("Database error deleting guest lecture:", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// ======= Create an Event Code ======= //
app.post("/api/create-event-code", async (req, res) => {
  const { guest_name, guest_email } = req.body;

  // Validate input
  if (!guest_name || !guest_email) {
    return res.status(400).json({
      success: false,
      message: "Guest name and email are required",
    });
  }

  try {
    // Generate a random 6-character alphanumeric event code
    const generateEventCode = () => {
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let code = "";
      for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    };

    let event_code = generateEventCode();

    // Check if the generated event code already exists
    let [existingCodes] = await pool.execute(
      "SELECT * FROM event_codes WHERE event_code = ?",
      [event_code]
    );

    // Regenerate the code if it already exists
    while (existingCodes.length > 0) {
      event_code = generateEventCode();
      [existingCodes] = await pool.execute(
        "SELECT * FROM event_codes WHERE event_code = ?",
        [event_code]
      );
    }

    // Insert the new event code
    await pool.execute(
      "INSERT INTO event_codes (event_code, guest_name, guest_email) VALUES (?, ?, ?)",
      [event_code, guest_name, guest_email]
    );

    // Send the event code via email
    await sendEventCodeEmail(guest_email, guest_name, event_code);

    res.status(201).json({
      success: true,
      message: `Event code created successfully and emailed to ${guest_email}`,
      data: { event_code }, // Return the generated event code
    });
  } catch (err) {
    console.error("Database error during event code creation:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
});

// =======  sending Email to guest with event codes
async function sendEventCodeEmail(to, guestName, eventCode) {
  const mailOptions = {
    from: process.env.EMAIL_FROM, // Sender email address
    to: to, // Recipient email address
    subject: "Your Event Code",
    text:
      `Dear ${guestName},\n\n` +
      `Thank you for the upcoming event you will be hosting for our students.\n\n` +
      `Your event code is: ${eventCode}\n\n` +
      `Please keep this code safe as you will need it to create the event on our application\n\n` +
      `Best regards,\n` +
      `MUT FACULTY OF NATURAL SCIENCES: DEPARTMENT OF ENVIRONMENTAL HEALTH`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Event code email sent to ${to}`);
  } catch (emailError) {
    console.error("Error sending event code email:", emailError);
    throw new Error("Event code created but failed to send email");
  }
}

// =======  Validate Event Code ======= //
app.post("/api/validate-event-code", async (req, res) => {
  const { code } = req.body;

  console.log("Received code for validation:", code);

  if (!code || code.trim() === "") {
    console.log("Validation failed: No code provided");
    return res.status(400).json({
      success: false,
      message: "Code is required",
    });
  }

  try {
    console.log("Querying database for code:", code);

    const [rows] = await pool.execute(
      "SELECT * FROM event_codes WHERE event_code = ?",
      [code]
    );

    if (rows.length > 0) {
      console.log("Validation successful: Code found");
      return res.status(200).json({
        success: true,
        message: "Code is valid",
        data: rows[0], // Return the associated guest details
      });
    } else {
      console.log("Validation failed: Code not found");
      return res.status(404).json({
        success: false,
        message: "Invalid code",
      });
    }
  } catch (err) {
    console.error("Database error during code validation:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Submit Declaration Letter
app.post(
  "/api/submit-declaration-letter",
  upload.fields([{ name: "supervisor_signature", maxCount: 1 }]),
  async (req, res) => {
    try {
      const {
        declarationDate,
        supervisorName,
        employerName,
        position,
        hiNumber,
        studentNumber,
        studentName,
        startDate,
        endDate,
        workEthic,
        timeliness,
        attitude,
        dress,
        interaction,
        responsibility,
        reportWriting,
        generalComments,
        signatureDate,
      } = req.body;

      // Validate required fields
      if (
        !supervisorName ||
        !employerName ||
        !position ||
        !hiNumber ||
        !studentName ||
        !studentNumber ||
        !startDate ||
        !endDate ||
        !workEthic ||
        !timeliness ||
        !attitude ||
        !dress ||
        !interaction ||
        !responsibility ||
        !reportWriting
      ) {
        return res.status(400).json({
          message:
            "Missing required fields. Please provide all required information.",
        });
      }

      // Validate date range
      if (new Date(startDate) > new Date(endDate)) {
        return res.status(400).json({
          message: "End date must be after start date.",
        });
      }

      // Access uploaded file
      const supervisorSignature =
        req.files["supervisor_signature"]?.[0]?.filename;

      // Prepare SQL query
      const sql = `
  INSERT INTO declaration_letters (
    declaration_date,
    student_number,
    supervisor_name,
    employer_name,
    position,
    hi_number,
    student_name,
    start_date,
    end_date,
    work_ethic,
    timeliness,
    attitude,
    dress,
    interaction,
    responsibility,
    report_writing,
    general_comments,
    supervisor_signature,
    signature_date
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

      const values = [
        declarationDate,
        studentNumber,
        supervisorName,
        employerName,
        position,
        hiNumber,
        studentName,
        startDate,
        endDate,
        workEthic,
        timeliness,
        attitude,
        dress,
        interaction,
        responsibility,
        reportWriting,
        generalComments || null,
        supervisorSignature || null,
        signatureDate,
      ];

      // Execute query
      await pool.execute(sql, values);

      // Return success response
      res.status(200).json({ message: "Declaration submitted successfully!" });
    } catch (error) {
      console.error("Error submitting declaration:", error);
      res.status(500).json({
        message: "Failed to submit declaration",
        error: error.message,
      });
    }
  }
);

// ======= Get All Declaration Letters ======= //
app.get("/api/declaration-letters", async (req, res) => {
  try {
    // Fetch all rows from the declaration_letters table ordered by declaration_date DESC
    const [rows] = await pool.execute(`
      SELECT * FROM declaration_letters
      ORDER BY declaration_date DESC
    `);

    const declarationLetters = rows.map((row) => {
      const filteredRow = {};

      for (const key in row) {
        if (row[key] !== null && row[key] !== undefined) {
          if (key === "supervisor_signature") {
            if (row[key]) {
              filteredRow[key] = `http://localhost:${port}/uploads/${row[key]}`;
            }
          } else {
            filteredRow[key] = row[key];
          }
        }
      }

      return filteredRow;
    });

    res.status(200).json(declarationLetters);
  } catch (error) {
    console.error("Error fetching declaration letters:", error);
    res
      .status(500)
      .json({ message: "Failed to retrieve declaration letters." });
  }
});

// Get declaration letter by email
app.get("/api/letters/:student_number", async (req, res) => {
  const student_number = req.params.student_number;

  try {
    // Query only the declaration letter for the given student number
    const [rows] = await pool.execute(
      "SELECT * FROM declaration_letters WHERE student_number = ?",
      [student_number]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        message: "Declaration letter not found for this student number.",
      });
    }

    // Prepare the result with file URL if present
    const filteredRow = {};
    const row = rows[0]; // expecting only one match per student

    for (const key in row) {
      if (row[key] !== null && row[key] !== undefined) {
        if (key === "supervisor_signature") {
          filteredRow[key] = `http://localhost:${port}/uploads/${row[key]}`;
        } else {
          filteredRow[key] = row[key];
        }
      }
    }

    res.status(200).json(filteredRow);
  } catch (error) {
    console.error("Error fetching declaration letter:", error);
    res.status(500).json({ message: "Failed to retrieve declaration letter." });
  }
});

// Add this DELETE endpoint
app.delete("/api/del-declaration-letters/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ID is valid
    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid declaration ID",
      });
    }

    // Verify logsheet exists
    const [rows] = await pool.execute(
      "SELECT supervisor_signature FROM declaration_letters WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Declaration letters not found." });
    }

    const letter = rows[0];

    // Delete associated signature files
    if (letter.supervisor_signature) {
    }

    if (letter.supervisor_signature) {
      const supervisorSigPath = path.join(
        __dirname,
        "uploads",
        letter.supervisor_signature
      );
      if (fs.existsSync(supervisorSigPath)) {
        fs.unlinkSync(supervisorSigPath);
      }
    }

    // Delete from database
    await pool.execute("DELETE FROM declaration_letters WHERE id = ?", [id]);

    res
      .status(200)
      .json({ message: "Declaration letter deleted successfully." });
  } catch (error) {
    console.error("Error deleting logsheet:", error);
    res.status(500).json({ message: "Failed to delete declaration letter." });
  }
});

// GET /api/profile/:email
// In your Node.js backend (server.js or similar)
app.get("/api/profile/:email", async (req, res) => {
  try {
    const { email } = req.params;

    const [rows] = await pool.execute(
      `SELECT 
        title, 
        first_names AS fullNames, 
        surname,
        cv_document AS cvDocument,
        id_document AS idDocument
       FROM wil_application 
       WHERE email = ?`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    const profileData = {
      ...rows[0],
      cvDocument: rows[0].cvDocument
        ? `${req.protocol}://${req.get("host")}/${rows[0].cvDocument}`
        : null,
      idDocument: rows[0].idDocument
        ? `${req.protocol}://${req.get("host")}/${rows[0].idDocument}`
        : null,
    };

    res.status(200).json({
      success: true,
      data: profileData,
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
    });
  }
});

// PUT /api/profile/:studentNumber
app.put(
  "/api/profile/:email",
  upload.fields([
    { name: "cvDocument", maxCount: 1 },
    { name: "idDocument", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { email } = req.params;
      const { title, fullNames, surname } = req.body;

      // Debugging
      console.log("Incoming update for email:", email);
      console.log("Body:", req.body);
      console.log("Files:", req.files);

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email is required",
        });
      }

      const updateFields = [];
      const values = [];

      if (title) {
        updateFields.push("title = ?");
        values.push(title);
      }

      if (fullNames) {
        updateFields.push("first_names = ?");
        values.push(fullNames);
      }

      if (surname) {
        updateFields.push("surname = ?");
        values.push(surname);
      }

      // Check for uploaded files and add their paths
      if (req.files) {
        if (req.files["cvDocument"]) {
          const cvPath = path.join(
            "uploads",
            req.files["cvDocument"][0].filename
          );
          updateFields.push("cv_document = ?");
          values.push(cvPath);
        }

        if (req.files["idDocument"]) {
          const idPath = path.join(
            "uploads",
            req.files["idDocument"][0].filename
          );
          updateFields.push("id_document = ?");
          values.push(idPath);
        }
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No fields provided for update",
        });
      }

      values.push(email);

      const query = `
        UPDATE wil_application 
        SET ${updateFields.join(", ")}
        WHERE email = ?
      `;

      const [result] = await pool.execute(query, values);

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Profile not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Profile updated successfully",
        updatedFields: updateFields.map((f) => f.split(" = ")[0]),
      });
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update profile",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

// Update password in both tables using email
app.put("/api/profile/:email/password", async (req, res) => {
  try {
    const { email } = req.params;
    const { currentPassword, newPassword } = req.body;

    // 1. Find user by email from student_users
    const [studentResult] = await pool.execute(
      "SELECT password FROM student_users WHERE email = ?",
      [email]
    );

    if (studentResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found in student_users table",
      });
    }

    // 2. Compare current password
    const isMatch = await bcrypt.compare(
      currentPassword,
      studentResult[0].password
    );
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // 3. Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 4. Update password in both tables
    await Promise.all([
      pool.execute("UPDATE student_users SET password = ? WHERE email = ?", [
        hashedPassword,
        email,
      ]),
      pool.execute("UPDATE users SET password = ? WHERE email = ?", [
        hashedPassword,
        email,
      ]),
    ]);

    res.status(200).json({
      success: true,
      message: "Password updated in both student_users and users tables",
    });
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update password",
    });
  }
});

// Get declaration letter by email
app.get("/api/letters/:email", async (req, res) => {
  const email = req.params.email;

  try {
    // Query only the declaration letter for the given email
    const [rows] = await pool.execute(
      "SELECT * FROM declaration_letters WHERE email = ?",
      [email]
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Declaration letter not found for this email." });
    }

    // Prepare the result with file URL if present
    const filteredRow = {};
    const row = rows[0]; // since we're expecting only one match per email

    for (const key in row) {
      if (row[key] !== null && row[key] !== undefined) {
        if (key === "supervisor_signature") {
          filteredRow[key] = `http://localhost:${port}/uploads/${row[key]}`;
        } else {
          filteredRow[key] = row[key];
        }
      }
    }

    res.status(200).json(filteredRow);
  } catch (error) {
    console.error("Error fetching declaration letter:", error);
    res.status(500).json({ message: "Failed to retrieve declaration letter." });
  }
});

// Get Student name and surname by student number
app.get("/api/student/:studentNumber", async (req, res) => {
  const studentNumber = req.params.studentNumber;

  try {
    const [results] = await pool.execute(
      "SELECT first_names, surname FROM wil_application WHERE student_number = ?",
      [studentNumber]
    );

    if (results.length === 0) {
      return res.status(404).json({ message: "Student not found" });
    }

    const student = results[0];
    res.status(200).json({
      fullName: `${student.first_names} ${student.surname}`, // ✅ fixed here
    });
  } catch (error) {
    console.error("Error retrieving student:", error);
    res.status(500).json({ message: "Failed to retrieve student" });
  }
});

// POST: Submit or Update Student Reflection
app.post("/api/submit-reflection", async (req, res) => {
  try {
    const {
      studentNumber,
      studentName,
      levelOfStudy,
      feeling,
      success,
      challenges,
      perspectiveChange,
      suggestions,
    } = req.body;

    // Validate input
    if (
      !studentNumber ||
      !studentName ||
      !levelOfStudy ||
      !feeling ||
      !success ||
      !challenges ||
      !perspectiveChange ||
      !suggestions
    ) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // Check if record already exists (using all three identifiers)
    const checkSql = `
      SELECT * FROM student_reflections 
      WHERE student_number = ? 
      AND student_name = ? 
      AND level_of_study = ?
    `;
    const [rows] = await pool.execute(checkSql, [
      studentNumber,
      studentName,
      levelOfStudy,
    ]);

    if (rows.length > 0) {
      // Record exists - update it
      const updateSql = `
        UPDATE student_reflections
        SET 
          feeling = ?, 
          success = ?, 
          challenges = ?,
          perspective_change = ?, 
          suggestions = ?,
          created_at = CURRENT_TIMESTAMP
        WHERE student_number = ?
        AND student_name = ?
        AND level_of_study = ?
      `;
      const updateValues = [
        feeling,
        success,
        challenges,
        perspectiveChange,
        suggestions,
        studentNumber,
        studentName,
        levelOfStudy,
      ];

      await pool.execute(updateSql, updateValues);
      return res
        .status(200)
        .json({ message: "Reflection updated successfully!" });
    } else {
      // Record does not exist - insert new one
      const insertSql = `
        INSERT INTO student_reflections (
          student_number, 
          student_name, 
          level_of_study,
          feeling, 
          success, 
          challenges,
          perspective_change, 
          suggestions
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const insertValues = [
        studentNumber,
        studentName,
        levelOfStudy,
        feeling,
        success,
        challenges,
        perspectiveChange,
        suggestions,
      ];

      await pool.execute(insertSql, insertValues);
      return res
        .status(200)
        .json({ message: "Reflection submitted successfully!" });
    }
  } catch (err) {
    console.error("Error processing reflection:", err);
    res
      .status(500)
      .json({ message: "Failed to process reflection", error: err.message });
  }
});

// GET: Last student's reflection (most recent by created_at)
app.get("/api/reflection/:studentNumber", async (req, res) => {
  try {
    const { studentNumber } = req.params;
    const sql = `
      SELECT * FROM student_reflections 
      WHERE student_number = ? 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    const [rows] = await pool.execute(sql, [studentNumber]);

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "No reflection found for this student." });
    }

    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("Error fetching reflection:", err);
    res
      .status(500)
      .json({ message: "Failed to fetch reflection", error: err.message });
  }
});

// GET: Fetch all reflections ordered by latest
app.get("/api/reflections", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM student_reflections ORDER BY created_at DESC");

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({ message: "No reflections found." });
    }

    res.status(200).json(rows);
  } catch (error) {
    console.error("Error fetching reflections:", error);
    res.status(500).json({ message: "Failed to fetch reflections." });
  }
});

// GET: Fetch all reflections ordered by latest
app.get("/api/reflections/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute("SELECT * FROM student_reflections WHERE id = ?", [id]);
    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.status(404).json({ message: "Reflection not found" });
    }
  } catch (error) {
    console.error("Error fetching reflection by ID:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// GET: Fetch reflections by id
app.get('/api/reflection/:studentNumber', async (req, res) => {
  const studentNumber = req.params.studentNumber;

  try {
    const [rows] = await pool.execute(
      'SELECT * FROM student_reflections WHERE student_number = ?',
      [studentNumber]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Reflection not found' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching reflection:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE: Delete a reflection by ID
app.delete("/api/reflections/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.execute(
      "DELETE FROM student_reflections WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Reflection not found" });
    }

    res.status(200).json({ message: "Reflection deleted successfully!" });
  } catch (err) {
    console.error("Error deleting reflection:", err);
    res.status(500).json({ message: "Failed to delete reflection" });
  }
});

// ======= Submit placement for a student ======= //
app.post("/api/submit-placement", async (req, res) => {
  try {
    const {
      studentNumber,
      studentName,
      supervisor,
      municipality,
      email,
      cellNumber,
      hospital,
      abattoir,
    } = req.body;

    // Validate required fields
    if (
      !studentNumber ||
      !studentName ||
      !supervisor ||
      !municipality ||
      !email ||
      !cellNumber
    ) {
      return res.status(400).json({ message: "Required fields are missing." });
    }

    // Check if a placement record exists for the student
    const checkSql = `SELECT * FROM student_placements WHERE student_number = ?`;
    const [rows] = await pool.execute(checkSql, [studentNumber]);

    if (rows.length > 0) {
      // Update existing record
      const updateSql = `
        UPDATE student_placements
        SET student_name = ?, supervisor = ?, municipality = ?, email = ?, 
            cell_number = ?, hospital = ?, abattoir = ?
        WHERE student_number = ?
      `;
      const updateValues = [
        studentName,
        supervisor,
        municipality,
        email,
        cellNumber,
        hospital,
        abattoir,
        studentNumber,
      ];

      await pool.execute(updateSql, updateValues);
      return res
        .status(200)
        .json({ message: "Placement updated successfully!" });
    } else {
      // Insert new record
      const insertSql = `
        INSERT INTO student_placements (
          student_number, student_name, supervisor, municipality, email, cell_number, hospital, abattoir
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const insertValues = [
        studentNumber,
        studentName,
        supervisor,
        municipality,
        email,
        cellNumber,
        hospital,
        abattoir,
      ];

      await pool.execute(insertSql, insertValues);
      return res
        .status(200)
        .json({ message: "Placement submitted successfully!" });
    }
  } catch (err) {
    console.error("Error processing placement:", err);
    res
      .status(500)
      .json({ message: "Failed to process placement", error: err.message });
  }
});

// ======= Get placement for a specific student ======= //
app.get("/api/placement/:student", async (req, res) => {
  try {
    const { student } = req.params;
    const sql = `SELECT * FROM student_placements WHERE student_number = ?`;
    const [rows] = await pool.execute(sql, [student]);

    if (rows.length === 0) {
      return res.status(404).json({ message: "No placement found." });
    }

    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("Error fetching placement:", err);
    res
      .status(500)
      .json({ message: "Failed to fetch placement", error: err.message });
  }
});

// ======= Fetch all placements ======= //
app.get("/api/placements", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM student_placements");
    if (!rows.length) {
      return res.status(404).json({ message: "No placements found." });
    }
    res.status(200).json(rows);
  } catch (err) {
    console.error("Error fetching placements:", err);
    res.status(500).json({ message: "Failed to fetch placements." });
  }
});

// ======= Delete a placement by ID ======= //
app.delete("/api/placements/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.execute(
      "DELETE FROM student_placements WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Placement not found." });
    }

    res.status(200).json({ message: "Placement deleted successfully!" });
  } catch (err) {
    console.error("Error deleting placement:", err);
    res.status(500).json({ message: "Failed to delete placement." });
  }
});

// ======= Get Students with Log Sheets =======
app.get("/api/students-with-log-sheets", async (req, res) => {
  try {
    // Step 1: Fetch all unique student numbers from daily_logsheet
    const [logSheetRows] = await pool.execute(
      "SELECT DISTINCT student_number FROM daily_logsheet"
    );

    if (logSheetRows.length === 0) {
      return res.status(200).json([]); // No students found with logs
    }

    // Extract just the student numbers into an array
    const studentNumbers = logSheetRows.map((row) => row.student_number);

    // Step 2: Fetch student details from wil_application for these students
    const placeholders = studentNumbers.map(() => "?").join(","); // For SQL IN clause
    const query = `
      SELECT first_names, surname, student_number, level_of_study 
      FROM wil_application
      WHERE student_number IN (${placeholders})
    `;

    const [applicationRows] = await pool.execute(query, studentNumbers);

    // Step 3: Format and return response
    res.status(200).json(applicationRows);
  } catch (error) {
    console.error("Error fetching students with log sheets:", error);
    res.status(500).json({ message: "Failed to retrieve students." });
  }
});

// ========== Get HPCSA status by student number
app.get("/api/hpcsa-status/:student_number", async (req, res) => {
  try {
    const { student_number } = req.params;
    const [rows] = await pool.execute(
      `SELECT check_status FROM hpcsa_report 
       WHERE student_number = ?`,
      [student_number]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: "Not Found",
        check_status: null,
      });
    }

    res.status(200).json({
      status: "Success",
      check_status: rows[0].check_status,
    });
  } catch (error) {
    console.error("Error fetching HPCSA status:", error);
    res.status(500).json({
      status: "Error",
      message: "Failed to fetch HPCSA status",
    });
  }
});

app.post("/api/update-hpcsa-report/:student_number", async (req, res) => {
  try {
    const { student_number } = req.params;

    if (!student_number) {
      return res.status(400).json({ message: "Student number is required" });
    }

    // Step 1: Get current status
    const [rows] = await pool.execute(
      "SELECT check_status FROM hpcsa_report WHERE student_number = ?",
      [student_number]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Student number not found" });
    }

    const currentStatus = rows[0].check_status?.toLowerCase() || "no";
    const newStatus = currentStatus === "yes" ? "No" : "Yes";

    // Step 2: Update to toggled status
    await pool.execute(
      "UPDATE hpcsa_report SET check_status = ? WHERE student_number = ?",
      [newStatus, student_number]
    );

    res.status(200).json({
      message: `HPCSA status toggled from ${currentStatus} to ${newStatus}`,
      check_status: newStatus,
    });
  } catch (error) {
    console.error("Error updating HPCSA status:", error);
    res.status(500).json({
      message: "Failed to update HPCSA status",
      error: error.message,
    });
  }
});

// ======= Fetch all students ======= //
app.get("/api/students", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT 
        id, 
        title AS student_name, 
        email, 
        created_at,
        status
      FROM student_users`
    );

    if (!rows.length) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "No students found.",
      });
    }

    res.status(200).json({
      success: true,
      data: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error("Error fetching students:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch students due to server error",
    });
  }
});

// =======  email functions for student status ======= //

async function sendSuspensionEmail(to) {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,
    subject: "You Have Been Suspended from the System",
    text:
      `Hello ${to},\n\n` +
      `Please be advised that your account has been suspended from the Work Integrated Learning system.\n\n` +
      `If you believe this was done in error or have questions, please contact the department.\n\n` +
      `Best regards,\n` +
      `MUT FACULTY OF NATURAL SCIENCES: DEPARTMENT OF ENVIRONMENTAL HEALTH`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Suspension email sent to ${to}`);
  } catch (error) {
    console.error("Error sending suspension email:", error);
  }
}

async function sendUnenrollEmail(to) {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,
    subject: "You Have Been Unenrolled from the System",
    text:
      `Hello ${to},\n\n` +
      `This email is to inform you that your status has been updated to 'unenrolled' in the Work Integrated Learning system.\n\n` +
      `Please reach out to your supervisor or the department for more information.\n\n` +
      `Best regards,\n` +
      `MUT FACULTY OF NATURAL SCIENCES: DEPARTMENT OF ENVIRONMENTAL HEALTH`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Unenroll email sent to ${to}`);
  } catch (error) {
    console.error("Error sending unenroll email:", error);
  }
}

async function sendEnrollmentEmail(to) {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to,
    subject: "You Have Been Enrolled into the System",
    text:
      `Hello ${to},\n\n` +
      `Congratulations! You have been enrolled into the Work Integrated Learning system.\n\n` +
      `You may now access the system and continue your placement activities.\n\n` +
      `Best regards,\n` +
      `MUT FACULTY OF NATURAL SCIENCES: DEPARTMENT OF ENVIRONMENTAL HEALTH`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Enrollment email sent to ${to}`);
  } catch (error) {
    console.error("Error sending enrollment email:", error);
  }
}


// ======= Suspend a student ======= //
app.post("/api/suspend-student/:student_number", async (req, res) => {
  const studentNumber = req.params.student_number;

  try {
    // First check if student exists
    const [student] = await pool.execute(
      `SELECT id FROM student_users WHERE email LIKE ?`,
      [`${studentNumber}@%`]
    );

    if (!student.length) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Update status to "suspended"
    await pool.execute(
      `UPDATE student_users SET status = 'suspended' WHERE email LIKE ?`,
      [`${studentNumber}@%`]
    );

    // Get updated student data
    const [updatedStudent] = await pool.execute(
      `SELECT 
        id, 
        title AS student_name, 
        email, 
        created_at,
        status
      FROM student_users 
      WHERE email LIKE ?`,
      [`${studentNumber}@%`]
    );

    await sendSuspensionEmail(updatedStudent[0].email);


    res.status(200).json({
      success: true,
      message: "Student suspended successfully",
      data: updatedStudent[0], // Now returns the actual status from DB
    });
  } catch (error) {
    console.error("Error suspending student:", error);
    res.status(500).json({
      success: false,
      message: "Failed to suspend student due to server error",
    });
  }
});

// ======= Unenroll a student ======= //
app.post("/api/unenroll-student/:student_number", async (req, res) => {
  const studentNumber = req.params.student_number;

  try {
    // First check if student exists
    const [student] = await pool.execute(
      `SELECT id FROM student_users WHERE email LIKE ?`,
      [`${studentNumber}@%`]
    );

    if (!student.length) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Update status to "unenrolled"
    await pool.execute(
      `UPDATE student_users SET status = 'unenrolled' WHERE email LIKE ?`,
      [`${studentNumber}@%`]
    );

    // Get updated student data
    const [updatedStudent] = await pool.execute(
      `SELECT 
        id, 
        title AS student_name, 
        email, 
        created_at,
        status
      FROM student_users 
      WHERE email LIKE ?`,
      [`${studentNumber}@%`]
    );

    await sendUnenrollEmail(updatedStudent[0].email);


    res.status(200).json({
      success: true,
      message: "Student unenrolled successfully",
      data: updatedStudent[0], // Now returns the actual status from DB
    });
  } catch (error) {
    console.error("Error unenrolling student:", error);
    res.status(500).json({
      success: false,
      message: "Failed to unenroll student due to server error",
    });
  }
});

// ======= Enroll a student ======= //
app.post("/api/enroll-student/:student_number", async (req, res) => {
  const studentNumber = req.params.student_number;

  try {
    const [student] = await pool.execute(
      `SELECT id FROM student_users WHERE email LIKE ?`,
      [`${studentNumber}@%`]
    );

    if (!student.length) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    await pool.execute(
      `UPDATE student_users SET status = 'active' WHERE email LIKE ?`,
      [`${studentNumber}@%`]
    );

    const [updatedStudent] = await pool.execute(
      `SELECT 
        id, 
        title AS student_name, 
        email, 
        created_at,
        status
      FROM student_users 
      WHERE email LIKE ?`,
      [`${studentNumber}@%`]
    );

    // ✅ Send enrollment email
    await sendEnrollmentEmail(updatedStudent[0].email, updatedStudent[0].student_name);

    res.status(200).json({
      success: true,
      message: "Student enrolled successfully",
      data: updatedStudent[0],
    });
  } catch (error) {
    console.error("Error enrolling student:", error);
    res.status(500).json({
      success: false,
      message: "Failed to enroll student due to server error",
    });
  }
});

// ======= Reactivate Student ======= //
app.post("/api/reactivate-student/:student_number", async (req, res) => {
  const studentNumber = req.params.student_number;

  try {
    // 1. Check if student exists
    const [student] = await pool.execute(
      `SELECT id FROM student_users WHERE email LIKE ?`,
      [`${studentNumber}@%`]
    );

    if (!student.length) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // 2. Check last activity date from logsheet
    const [lastActivity] = await pool.execute(
      `SELECT MAX(log_date) as last_log_date 
       FROM daily_logsheet 
       WHERE student_number = ?`,
      [studentNumber]
    );

    const lastLogDate = lastActivity[0].last_log_date;

    // If no log entries found
    if (!lastLogDate) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot reactivate - no activity records found for this student",
      });
    }

    // 3. Calculate days since last activity
    const [daysResult] = await pool.execute(
      `SELECT DATEDIFF(CURDATE(), ?) as days_since_last_activity`,
      [lastLogDate]
    );

    const daysSinceLastActivity = daysResult[0].days_since_last_activity;

    // 4. Verify activity is within 10 days
    if (daysSinceLastActivity > 10) {
      return res.status(400).json({
        success: false,
        message: `Cannot reactivate - last activity was ${daysSinceLastActivity} days ago (maximum 10 days allowed)`,
        last_activity_date: lastLogDate,
        days_since_last_activity: daysSinceLastActivity,
      });
    }

    // 5. Update status to 'active'
    await pool.execute(
      `UPDATE student_users SET status = 'active' WHERE email LIKE ?`,
      [`${studentNumber}@%`]
    );

    // 6. Get updated student data
    const [updatedStudent] = await pool.execute(
      `SELECT 
        id, 
        title AS student_name, 
        email, 
        created_at,
        status
      FROM student_users 
      WHERE email LIKE ?`,
      [`${studentNumber}@%`]
    );

    res.status(200).json({
      success: true,
      message: "Student reactivated successfully",
      data: updatedStudent[0],
      last_activity_date: lastLogDate,
      days_since_last_activity: daysSinceLastActivity,
    });
  } catch (error) {
    console.error("Error reactivating student:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reactivate student due to server error",
    });
  }
});

// ======= Update Student Status Based on Activity ======= //
app.post("/api/update-student-status/:student_number", async (req, res) => {
  const studentNumber = req.params.student_number;
  console.log("Received update status request for student:", studentNumber);

  try {
    // 1. Check if student exists
    const [student] = await pool.execute(
      `SELECT id, status FROM student_users WHERE email LIKE ?`,
      [`${studentNumber}@%`]
    );
    console.log("Student query result:", student);

    if (!student.length) {
      console.log("Student not found");
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // 2. Check last activity date from logsheet
    const [lastActivity] = await pool.execute(
      `SELECT MAX(log_date) as last_log_date 
       FROM daily_logsheet 
       WHERE student_number = ?`,
      [studentNumber]
    );
    console.log("Last activity query result:", lastActivity);

    const lastLogDate = lastActivity[0].last_log_date;
    let newStatus = student[0].status; // current status
    let message = "Student status unchanged";
    let statusChanged = false;

    let daysSinceLastActivity = null; // declare here to avoid ReferenceError

    if (!lastLogDate) {
      newStatus = "inactive";
      message = "No activity records found - status set to inactive";
      console.log(message);
    } else {
      // 3. Calculate days since last activity
      const [daysResult] = await pool.execute(
        `SELECT DATEDIFF(CURDATE(), ?) as days_since_last_activity`,
        [lastLogDate]
      );
      console.log("Days since last activity:", daysResult);

      daysSinceLastActivity = daysResult[0].days_since_last_activity;

      if (daysSinceLastActivity <= 10) {
        newStatus = "active";
        message = `Student reactivated - last activity was ${daysSinceLastActivity} days ago`;
      } else {
        newStatus = "inactive";
        message = `Student set to inactive - last activity was ${daysSinceLastActivity} days ago (10 day limit)`;
      }
      console.log(message);
    }

    // 4. Update status if changed
    if (newStatus !== student[0].status) {
      const [updateResult] = await pool.execute(
        `UPDATE student_users SET status = ? WHERE email LIKE ?`,
        [newStatus, `${studentNumber}@%`]
      );
      console.log("Update status result:", updateResult);
      statusChanged = true;
    }

    // 5. Get updated student data
    const [updatedStudent] = await pool.execute(
      `SELECT 
        id, 
        title AS student_name, 
        email, 
        created_at,
        status
      FROM student_users 
      WHERE email LIKE ?`,
      [`${studentNumber}@%`]
    );

    res.status(200).json({
      success: true,
      message,
      status_changed: statusChanged,
      data: updatedStudent[0],
      last_activity_date: lastLogDate,
      days_since_last_activity: lastLogDate ? daysSinceLastActivity : null,
    });
  } catch (error) {
    console.error("Error updating student status:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update student status due to server error",
      error: error.message,  // add error message for debugging
    });
  }
});


// In your server.js or routes file
app.post("/api/update-student-status", async (req, res) => {
  try {
    const { student_number } = req.body;

    if (!student_number) {
      return res.status(400).json({
        success: false,
        message: "Student number is required",
      });
    }

    // Update the student status
    const [result] = await pool.execute(
      `UPDATE student_users 
       SET status = 'active' 
       WHERE email LIKE CONCAT(?, '@%')`,
      [student_number]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    res.json({
      success: true,
      message: "Student status updated to active",
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});


app.post("/api/update-status-for-inactive-students", async (req, res) => {
  try {
    // 1. Get all active students
    const [activeStudents] = await pool.execute(
      `SELECT email FROM student_users WHERE status = 'active'`
    );

    if (!activeStudents.length) {
      return res.json({
        success: true,
        message: "No active students found",
        updated_students: [],
      });
    }

    const updatedStudents = [];

    // 2. Loop through each student and check their last log date
    for (const student of activeStudents) {
      const studentNumber = student.email.split("@")[0];

      // Get last activity
      const [lastActivity] = await pool.execute(
        `SELECT MAX(log_date) AS last_log_date FROM daily_logsheet WHERE student_number = ?`,
        [studentNumber]
      );

      const lastLogDate = lastActivity[0].last_log_date;

      if (!lastLogDate) {
        // No logs? Inactivate
        await pool.execute(
          `UPDATE student_users SET status = 'inactive' WHERE email = ?`,
          [student.email]
        );
        updatedStudents.push(studentNumber);
        continue;
      }

      // Compare dates
      const [daysResult] = await pool.execute(
        `SELECT DATEDIFF(CURDATE(), ?) AS days_since_last_activity`,
        [lastLogDate]
      );

      const days = daysResult[0].days_since_last_activity;

      if (days > 10) {
        await pool.execute(
          `UPDATE student_users SET status = 'inactive' WHERE email = ?`,
          [student.email]
        );
        updatedStudents.push(studentNumber);
      }
    }

    res.json({
      success: true,
      message: "Student statuses updated successfully",
      updated_students: updatedStudents,
    });
  } catch (error) {
    console.error("Error in bulk status update:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during status update",
      error: error.message,
    });
  }
});

// ======= Get all staff ======= //
app.get('/api/staff', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT staff_id, title, email, created_at FROM staff_users'
    );
    res.json({ success: true, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Failed to fetch staff.' });
  }
});

// ======= Delete staff Based on staff ID ======= //
app.delete('/api/staff/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.execute('DELETE FROM staff_users WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: 'Not found.' });
    }
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: 'Deletion failed.' });
  }
});

// ======= Update mentor status ======= //
app.post("/api/update-mentor-check", async (req, res) => {
  try {
    const { logsheetId, mentor_check } = req.body;

    if (!logsheetId || mentor_check === undefined) {
      return res.status(400).json({
        success: false,
        message: "logsheetId and mentor_check are required",
      });
    }

    const [result] = await pool.execute(
      `UPDATE daily_logsheet 
       SET mentor_check = ? 
       WHERE id = ?`,
      [mentor_check, logsheetId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Logsheet record not found",
      });
    }

    res.json({
      success: true,
      message: `Mentor check ${mentor_check === 'checked' ? 'confirmed' : 'reverted'} successfully.`,
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});


// // =======  Get students for attendance register by event_id ======= //
app.get("/api/event-attendance/register/:eventId", async (req, res) => {
  const { eventId } = req.params;

  try {
    // Check if event exists
    const [eventRows] = await pool.execute(
      `SELECT register_status, event_date FROM guest_lectures WHERE id = ?`,
      [eventId]
    );

    if (eventRows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: "Event not found" 
      });
    }

    if (eventRows[0].register_status !== "active") {
      return res.status(403).json({ 
        success: false, 
        message: "Registration not active for this event" 
      });
    }

    // Get accepted students with their registration count
    const [students] = await pool.execute(
      `SELECT 
         w.id, w.surname, w.initials, w.first_names, w.student_number,
         (SELECT COUNT(*) FROM event_attendance 
          WHERE event_id = ? AND student_id = w.id) as registration_count
       FROM wil_application w 
       WHERE w.status = 'accepted'`,
      [eventId]
    );

    res.status(200).json({
      success: true,
      eventDate: eventRows[0].event_date.toISOString().split("T")[0],
      data: students,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
    });
  }
});


app.post("/api/event-attendance/mark", async (req, res) => {
  const { event_id, student_id, attended } = req.body;

  if (!event_id || !student_id || typeof attended !== "boolean") {
    return res.status(400).json({ 
      success: false, 
      message: "Missing required fields" 
    });
  }

  try {
    // Get the wil_application ID first
    const [studentStatus] = await pool.execute(
      `SELECT id FROM wil_application WHERE student_number = ?`,
      [student_id]
    );

    if (studentStatus.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const wilAppId = studentStatus[0].id;

    // Check existing attendance records
    const [records] = await pool.execute(
      `SELECT id, attended FROM event_attendance 
       WHERE event_id = ? AND student_id = ? 
       ORDER BY signed_at DESC LIMIT 1`,
      [event_id, wilAppId]
    );

    if (records.length > 0) {
      // Update most recent record
      await pool.execute(
        `UPDATE event_attendance 
         SET attended = ?, signed_at = ? 
         WHERE id = ?`,
        [attended, attended ? new Date() : null, records[0].id]
      );
    } else {
      // Create new record if none exists (shouldn't normally happen)
      await pool.execute(
        `INSERT INTO event_attendance 
         (event_id, student_id, attended, signed_at) 
         VALUES (?, ?, ?, ?)`,
        [event_id, wilAppId, attended, attended ? new Date() : null]
      );
    }

    res.status(200).json({ 
      success: true, 
      message: "Attendance updated successfully" 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
    });
  }
});

// // =======  register a students for attendance on an event ======= //
app.post("/api/lectures/register", async (req, res) => {
  const { event_id, student_id } = req.body;

  if (!event_id || !student_id) {
    return res.status(400).json({
      success: false,
      message: "Missing event_id or student_id",
    });
  }

  try {
    // 1. Verify that the event exists and registration is active
    const [eventResult] = await pool.execute(
      `SELECT register_status, event_date FROM guest_lectures WHERE id = ?`,
      [event_id]
    );

    if (eventResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    const event = eventResult[0];

    if (event.register_status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Registration is not active for this event",
      });
    }

    // Allow registration for today — compare only date (ignore time)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const eventDate = new Date(event.event_date);
    eventDate.setHours(0, 0, 0, 0);

    if (eventDate < today) {
      return res.status(403).json({
        success: false,
        message: "Cannot register for past events",
      });
    }

    // 2. Confirm the student is in the WIL application list and accepted
    const [studentStatus] = await pool.execute(
      `SELECT id FROM wil_application WHERE student_number = ? AND status = 'accepted'`,
      [student_id]
    );

    if (studentStatus.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You are not eligible to register for this event",
      });
    }

    const wilAppId = studentStatus[0].id;

    // 3. Check existing registrations (updated to count registrations)
    const [registrations] = await pool.execute(
      `SELECT COUNT(*) as registration_count 
       FROM event_attendance 
       WHERE event_id = ? AND student_id = ?`,
      [event_id, wilAppId]
    );

    const registrationCount = registrations[0].registration_count;

    if (registrationCount >= 1) {
      return res.status(403).json({
        success: false,
        message: "Maximum registrations (2) reached for this event",
      });
    }

    // 4. Insert new registration
    await pool.execute(
      `INSERT INTO event_attendance (event_id, student_id, attended) 
       VALUES (?, ?, ?)`,
      [event_id, wilAppId, false]
    );

    return res.status(201).json({
      success: true,
      message: "Successfully registered for the lecture",
    });
  } catch (error) {
    console.error("Error during registration:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Get all attendance registers with detailed information
app.get("/api/attendance-registers", async (req, res) => {
  try {
    const [registers] = await pool.execute(`
      SELECT 
        gl.id AS event_id,
        gl.title AS event_title,
        gl.guest_name,
        gl.event_type,
        gl.event_date,
        COUNT(ea.id) AS total_registrations,
        SUM(ea.attended) AS attended_count
      FROM guest_lectures gl
      LEFT JOIN event_attendance ea ON gl.id = ea.event_id
      GROUP BY gl.id
      ORDER BY gl.event_date DESC
    `);

    res.status(200).json({
      success: true,
      data: registers
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Internal server error" });}
});


// Get attendance details for a specific event
app.get("/api/attendance-registers/:eventId", async (req, res) => {
  const { eventId } = req.params;

  try {
    // Get event details
    const [eventDetails] = await pool.execute(`
      SELECT 
        gl.title AS event_title,
        gl.guest_name,
        gl.event_type,
        gl.event_date
      FROM guest_lectures gl
      WHERE gl.id = ?
    `, [eventId]);

    if (eventDetails.length === 0) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    // Get attendance records
    const [attendanceRecords] = await pool.execute(`
      SELECT 
        ea.id AS attendance_id,
        ea.attended,
        ea.signed_at,
        wa.id AS student_id,
        wa.title AS student_title,
        wa.initials,
        wa.student_number,
        wa.first_names,
        wa.surname
      FROM event_attendance ea
      JOIN wil_application wa ON ea.student_id = wa.id
      WHERE ea.event_id = ?
      ORDER BY wa.surname, wa.first_names
    `, [eventId]);

    res.status(200).json({
      success: true,
      event: eventDetails[0],
      attendance: attendanceRecords
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


// ======= Signature Upload Endpoints ======= //

// ======= Signature Upload Endpoints ======= //
app.post('/api/signatures/student', async (req, res) => {
    const { student_id, email, signature_image, document_type, document_id } = req.body;

    try {
        // Validate required fields
        if (!student_id || !email || !signature_image) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        // Insert signature
        const [result] = await pool.execute(
            `INSERT INTO student_signatures 
             (student_id, email, signature_image, document_type, document_id) 
             VALUES (?, ?, ?, ?, ?)`,
            [student_id, email, signature_image, document_type || null, document_id || null]
        );

        res.status(201).json({
            success: true,
            message: "Student signature saved successfully",
            signature_id: result.insertId
        });
    } catch (error) {
        console.error("Error saving student signature:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// ======= Staff signature upload ======= //
app.post('/api/signatures/staff', async (req, res) => {
    const { staff_id, email, signature_image, document_type, document_id } = req.body;

    try {
        // Validate required fields
        if (!staff_id || !email || !signature_image) {
            return res.status(400).json({ success: false, message: "Missing required fields" });
        }

        // Insert signature
        const [result] = await pool.execute(
            `INSERT INTO staff_signatures 
             (staff_id, email, signature_image, document_type, document_id) 
             VALUES (?, ?, ?, ?, ?)`,
            [staff_id, email, signature_image, document_type || null, document_id || null]
        );

        res.status(201).json({
            success: true,
            message: "Staff signature saved successfully",
            signature_id: result.insertId
        });
    } catch (error) {
        console.error("Error saving staff signature:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});


// ====== Dashboard Analytics Endpoint ======
app.get('/dashboard', async (req, res) => {
  try {
    const { range, start, end } = req.query;
    const dateRanges = calculateDateRanges(range, start, end);

    const [
      applications,
      logsheets,
      attendance,
      placements,
      studentProgress,
      systemActivity
    ] = await Promise.all([
      getApplicationsData(dateRanges),
      getLogsheetsData(dateRanges),
      getAttendanceData(dateRanges),
      getPlacementsData(),
      getStudentProgressData(),
      getSystemActivityData(dateRanges)
    ]);

    res.json({
      applications,
      logsheets,
      attendance,
      placements,
      studentProgress,
      systemActivity
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to load analytics data' });
  }
});

// ====== Helper Functions ======
function calculateDateRanges(range, start, end) {
  const now = moment();
  const currentEnd = end ? moment(end) : now.clone();
  let currentStart, previousStart, previousEnd;

  switch (range) {
    case '7days':
      currentStart = currentEnd.clone().subtract(7, 'days');
      previousEnd = currentStart.clone();
      previousStart = previousEnd.clone().subtract(7, 'days');
      break;
    case '30days':
      currentStart = currentEnd.clone().subtract(30, 'days');
      previousEnd = currentStart.clone();
      previousStart = previousEnd.clone().subtract(30, 'days');
      break;
    case '90days':
      currentStart = currentEnd.clone().subtract(90, 'days');
      previousEnd = currentStart.clone();
      previousStart = previousEnd.clone().subtract(90, 'days');
      break;
    case 'custom':
      currentStart = moment(start);
      const diffDays = currentEnd.diff(currentStart, 'days');
      previousEnd = currentStart.clone();
      previousStart = previousEnd.clone().subtract(diffDays, 'days');
      break;
    default:
      currentStart = currentEnd.clone().subtract(30, 'days');
      previousEnd = currentStart.clone();
      previousStart = previousEnd.clone().subtract(30, 'days');
  }

  return {
    current: {
      start: currentStart.format('YYYY-MM-DD'),
      end: currentEnd.format('YYYY-MM-DD')
    },
    previous: {
      start: previousStart.format('YYYY-MM-DD'),
      end: previousEnd.format('YYYY-MM-DD')
    }
  };
}

async function getApplicationsData(dateRanges) {
  const [currentResults] = await pool.execute(`
    SELECT status, COUNT(*) as count 
    FROM wil_application 
    WHERE created_at BETWEEN ? AND ?
    GROUP BY status
  `, [dateRanges.current.start, dateRanges.current.end]);

  const [previousResults] = await pool.execute(`
    SELECT COUNT(*) as total 
    FROM wil_application 
    WHERE created_at BETWEEN ? AND ?
  `, [dateRanges.previous.start, dateRanges.previous.end]);

  const previousTotal = previousResults[0]?.total || 0;
  const currentTotal = currentResults.reduce((sum, item) => sum + item.count, 0);

  return {
    statusLabels: currentResults.map(item => item.status),
    statusCounts: currentResults.map(item => item.count),
    totalChange: calculateChange(previousTotal, currentTotal)
  };
}

async function getLogsheetsData(dateRanges) {
  const [results] = await pool.execute(`
    SELECT 
      DATE_FORMAT(log_date, '%Y-%m') as month,
      COUNT(*) as count
    FROM daily_logsheet
    WHERE log_date BETWEEN ? AND ?
    GROUP BY DATE_FORMAT(log_date, '%Y-%m')
    ORDER BY month
  `, [dateRanges.current.start, dateRanges.current.end]);

  return results;
}

async function getAttendanceData(dateRanges) {
  const [results] = await pool.execute(`
    SELECT 
      SUM(CASE WHEN attended = 1 THEN 1 ELSE 0 END) as attended,
      COUNT(*) as registered,
      SUM(CASE WHEN attended = 0 THEN 1 ELSE 0 END) as noShow
    FROM event_attendance ea
    JOIN guest_lectures gl ON ea.event_id = gl.id
    WHERE gl.event_date BETWEEN ? AND ?
  `, [dateRanges.current.start, dateRanges.current.end]);

  return results[0] || { attended: 0, registered: 0, noShow: 0 };
}

async function getPlacementsData() {
  const [results] = await pool.execute(`
    SELECT municipality, COUNT(*) as count
    FROM student_placements
    GROUP BY municipality
    ORDER BY count DESC
    LIMIT 10
  `);

  return results;
}

async function getStudentProgressData() {
  const [results] = await pool.execute(`
    SELECT 
      su.email AS student,
      ROUND((COUNT(dl.id) / 30) * 100) AS percentage
    FROM student_users su
    JOIN daily_logsheet dl ON su.email = dl.student_number
    GROUP BY su.email
    ORDER BY percentage DESC
    LIMIT 5
  `);

  return results;
}


async function getSystemActivityData(dateRanges) {
  const [
    [applicationsRows],
    [studentsRows],
    [logsheetsRows],
    [attendanceRows]
  ] = await Promise.all([
    pool.execute(`
      SELECT 
        COUNT(*) as totalApplications,
        (SELECT COUNT(*) FROM wil_application 
         WHERE created_at BETWEEN ? AND ?) as currentPeriod,
        (SELECT COUNT(*) FROM wil_application 
         WHERE created_at BETWEEN ? AND ?) as previousPeriod
      FROM wil_application
    `, [
      dateRanges.current.start, dateRanges.current.end,
      dateRanges.previous.start, dateRanges.previous.end
    ]),
    pool.execute(`
      SELECT COUNT(*) as activeStudents FROM student_users WHERE status = 'active'
    `),
    pool.execute(`
      SELECT COUNT(*) as completedLogsheets FROM daily_logsheet 
      WHERE supervisor_signature IS NOT NULL
    `),
    pool.execute(`
      SELECT 
        ROUND((SUM(attended) / COUNT(*)) * 100) as eventAttendance
      FROM event_attendance
    `)
  ]);

  const applications = applicationsRows[0];
  const students = studentsRows[0];
  const logsheets = logsheetsRows[0];
  const attendance = attendanceRows[0];

  return [{
    totalApplications: applications.totalApplications,
    applicationChange: calculateChange(applications.previousPeriod, applications.currentPeriod),
    activeStudents: students.activeStudents,
    completedLogsheets: logsheets.completedLogsheets,
    eventAttendance: attendance.eventAttendance || 0
  }];
}

function calculateChange(previous, current) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// ======= Interview Invitation Email API ======= //
app.post("/api/send-interview-invite", async (req, res) => {
  const { to, name } = req.body;

  if (!to || !name) {
    return res.status(400).json({ message: "Missing recipient email or name" });
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM, // e.g. "CodeSA Institute <your-email@gmail.com>"
    to: to,
    subject: "Python Learnership Interview Invitation – Thursday, 26 June 2025",
    text: `
Dear ${name},

Congratulations!!!

Thank you for your interest in our remarkable organisation and for your application to our Python Learnership Training starting July 2025.

For the next part of the process, we will need you to please make yourself available this **Thursday, 26 June 2025** for an office interview.

📍 Python Learnership Training – Please click on the link below to get all the information about where we are located:
https://codingmadeeasy.org/contact-us

🆔 Kindly ensure that you have your certified copy of ID Document*, Malusi*, Qualification*, Transcript (if any) and SAPS Affidavite on the day of the interview.

⏰ All interviews will start at **09:00 AM**, and you will receive a response after we have made further reviews.

For any issues accessing the link, please contact:
Lungile Mthethwa: info@codingmadeeasy.org

We look forward to interacting with you further – come prepared.

💡 Remember, the first answer to every interview is your **appearance**!

Good luck!!!

Kind regards,  
Nombeko Training Consultants & CodeSA Institute (PTY) LTD
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Interview invite email sent to ${to}`);
    res.status(200).json({ message: "Interview invitation sent successfully" });
  } catch (error) {
    console.error("Error sending interview invite:", error);
    res.status(500).json({ message: "Failed to send interview email" });
  }
});


// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`Environment: ${isProduction ? 'Production' : 'Development'}`);
  console.log(`Allowed origins: ${frontendUrls.join(', ')}`);
  if (isProduction && !process.env.REDIS_URL) {
    console.warn('WARNING: Running in production without Redis');
  }
});