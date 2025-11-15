const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// IMPORTANT: Update CORS to allow your Vercel frontend
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://vercel-frontend-5k4d81x7z-tonmoys-projects-9c9788f9.vercel.app",
      /https:\/\/.*\.vercel\.app$/, // Allow all Vercel preview URLs
      process.env.CLIENT_URL,
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// Add a root route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Transparency Bangladesh API is running",
    version: "1.0.0",
    endpoints: {
      dashboard: "/api/dashboard/statistics",
      reports: "/api/reports",
      trainers: "/trainers",
      events: "/events",
      govtSpending: "/api/govt-spending",
    },
  });
});

// MongoDB Connection with proper URI
const uri =
  process.env.MONGODB_URI ||
  `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ivueggz.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  ignoreUndefined: true,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

// Serve static files for uploaded evidence
app.use("/uploads", express.static("uploads"));

// Create uploads directory if it doesn't exist
const uploadsDir = "./uploads";
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf|mp3|mp4/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only JPEG, PNG, PDF, MP3, and MP4 are allowed."
      )
    );
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: fileFilter,
});

// Configure multer for trainer photos
const trainerStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = "uploads/trainers";
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "trainer-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const uploadTrainerPhoto = multer({
  storage: trainerStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Only image files are allowed (jpeg, jpg, png, gif, webp)"));
    }
  },
});

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

async function run() {
  try {
    await client.connect();

    const registrationCollection = client
      .db("transparency-bangladesh")
      .collection("registration");
    const logInuserCollection = client
      .db("transparency-bangladesh")
      .collection("logInUsers");
    const reportCollection = client
      .db("transparency-bangladesh")
      .collection("corruption_reports");
    const accFormCollection = client
      .db("transparency-bangladesh")
      .collection("acc_form_reports");
    const adminCollection = client
      .db("transparency-bangladesh")
      .collection("admins");
    const trainersCollection = client
      .db("transparencyBD")
      .collection("trainers");
    const eventsCollection = client
      .db("transparencyBD")
      .collection("education_events");
    const govtSpendingCollection = client
      .db("transparency-bangladesh")
      .collection("govt_spending");

    // ========== CREATE DEFAULT ADMIN ==========
    console.log("🔍 Checking for default admin...");

    const existingAdmin = await adminCollection.findOne({
      email: "tonmoy.sufian01@gmail.com",
    });

    if (!existingAdmin) {
      console.log("⚙️ Creating default admin...");
      const hashedPassword = await bcrypt.hash("C#c12345", 10);
      const defaultAdmin = {
        email: "tonmoy.sufian01@gmail.com",
        password: hashedPassword,
        role: "super-admin",
        name: "Tonmoy Sufian",
        createdAt: new Date(),
        isActive: true,
        lastLogin: null,
      };

      await adminCollection.insertOne(defaultAdmin);
      console.log("✅ Default admin created successfully");
    } else {
      console.log("✅ Default admin already exists");
    }

    // ========== ADMIN LOGIN ENDPOINT ==========
    app.post("/api/admin/login", async (req, res) => {
      try {
        console.log("🔐 Admin login attempt:", req.body.email);

        const { email, password } = req.body;

        if (!email || !password) {
          return res.status(400).json({
            success: false,
            message: "Email and password are required",
          });
        }

        const admin = await adminCollection.findOne({ email: email });

        if (!admin) {
          console.log("❌ Admin not found:", email);
          return res.status(401).json({
            success: false,
            message: "Invalid credentials",
          });
        }

        if (!admin.isActive) {
          console.log("❌ Admin account deactivated:", email);
          return res.status(403).json({
            success: false,
            message: "Admin account is deactivated",
          });
        }

        const isPasswordValid = await bcrypt.compare(password, admin.password);

        if (!isPasswordValid) {
          console.log("❌ Invalid password for:", email);
          return res.status(401).json({
            success: false,
            message: "Invalid credentials",
          });
        }

        await adminCollection.updateOne(
          { _id: admin._id },
          { $set: { lastLogin: new Date() } }
        );

        const { password: _, ...adminData } = admin;

        console.log("✅ Admin login successful:", email);

        res.json({
          success: true,
          message: "Admin login successful",
          admin: {
            ...adminData,
            lastLogin: new Date(),
          },
        });
      } catch (error) {
        console.error("💥 Error in admin login:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    // Get all admins (super-admin only)
    app.get("/api/admins", async (req, res) => {
      try {
        const cursor = adminCollection.find(
          {},
          { projection: { password: 0 } }
        );
        const result = await cursor.toArray();
        res.json({
          success: true,
          count: result.length,
          data: result,
        });
      } catch (error) {
        console.error("Error fetching admins:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch admins",
        });
      }
    });

    // Create new admin (super-admin only)
    app.post("/api/admins", async (req, res) => {
      try {
        const { email, password, name, role } = req.body;

        // Check if admin already exists
        const existingAdmin = await adminCollection.findOne({ email });
        if (existingAdmin) {
          return res.status(400).json({
            success: false,
            message: "Admin with this email already exists",
          });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        const newAdmin = {
          email,
          password: hashedPassword,
          name,
          role: role || "admin", // admin or super-admin
          createdAt: new Date(),
          isActive: true,
        };

        const result = await adminCollection.insertOne(newAdmin);

        res.status(201).json({
          success: true,
          message: "Admin created successfully",
          adminId: result.insertedId,
        });
      } catch (error) {
        console.error("Error creating admin:", error);
        res.status(500).json({
          success: false,
          message: "Failed to create admin",
        });
      }
    });

    // Update admin
    app.patch("/api/admins/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { name, role, isActive, password } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid admin ID format",
          });
        }

        const updateDoc = {
          $set: {
            updatedAt: new Date(),
          },
        };

        if (name) updateDoc.$set.name = name;
        if (role) updateDoc.$set.role = role;
        if (typeof isActive === "boolean") updateDoc.$set.isActive = isActive;
        if (password) {
          const hashedPassword = await bcrypt.hash(password, 10);
          updateDoc.$set.password = hashedPassword;
        }

        const result = await adminCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Admin not found",
          });
        }

        res.json({
          success: true,
          message: "Admin updated successfully",
        });
      } catch (error) {
        console.error("Error updating admin:", error);
        res.status(500).json({
          success: false,
          message: "Failed to update admin",
        });
      }
    });

    // Delete admin
    app.delete("/api/admins/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid admin ID format",
          });
        }

        // Check if it's the default admin
        const admin = await adminCollection.findOne({ _id: new ObjectId(id) });
        if (admin && admin.email === "tonmoy.sufian01@gmail.com") {
          return res.status(403).json({
            success: false,
            message: "Cannot delete default super admin",
          });
        }

        const result = await adminCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Admin not found",
          });
        }

        res.json({
          success: true,
          message: "Admin deleted successfully",
        });
      } catch (error) {
        console.error("Error deleting admin:", error);
        res.status(500).json({
          success: false,
          message: "Failed to delete admin",
        });
      }
    });

    // ========== EXISTING ENDPOINTS ==========

    app.post("/api/login", async (req, res) => {
      try {
        const { email, password, lastSignIn, userId } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const now = new Date();
        const formatted = now.toLocaleString();
        const loginUser = {
          email,
          password: hashedPassword,
          lastSignIn,
          createdAt: formatted,
          userId,
        };
        const result = await logInuserCollection.insertOne(loginUser);
        if (result.insertedId) {
          res.json({
            success: true,
            message: "Login information saved successfully",
          });
        } else {
          res.status(400).json({
            success: false,
            message: "Failed to save login information",
          });
        }
      } catch (error) {
        console.error("Error in login:", error);
        res.status(500).json({
          success: false,
          message: "Internal server error",
        });
      }
    });

    app.get("/api/login", async (req, res) => {
      const cursor = logInuserCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/registers", async (req, res) => {
      const cursor = registrationCollection.find();
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/registers", async (req, res) => {
      const register = req.body;
      console.log(register);
      const result = await registrationCollection.insertOne(register);
      res.send(result);
    });

    // Add to your index.js
    app.put("/registers/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const updateData = req.body;

        const result = await registrationCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { ...updateData, updatedAt: new Date() } }
        );

        res.json({ success: true, message: "User updated successfully" });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.delete("/registers/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const result = await registrationCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.json({ success: true, message: "User deleted successfully" });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // POST endpoint to create a new report (handles both anonymous and non-anonymous)
    app.post("/reports", async (req, res) => {
      try {
        const reportData = req.body;
        if (
          !reportData.problemType ||
          !reportData.description ||
          !reportData.incidentAddress ||
          !reportData.incidentDivision
        ) {
          return res.status(400).json({
            success: false,
            message: "Missing required fields",
          });
        }
        const report = {
          problemType: reportData.problemType,
          description: reportData.description,
          incidentAddress: reportData.incidentAddress,
          incidentDivision: reportData.incidentDivision,
          isAnonymous: reportData.isAnonymous || false,
          status: "pending",
          submittedAt: reportData.submittedAt || new Date().toLocaleString(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        if (!reportData.isAnonymous) {
          if (!reportData.name || !reportData.phone || !reportData.address) {
            return res.status(400).json({
              success: false,
              message:
                "Reporter information is required for non-anonymous reports",
            });
          }
          report.name = reportData.name;
          report.phone = reportData.phone;
          report.address = reportData.address;
          report.userId = reportData.userId || null;
          report.eligibleForReward = true;
          report.rewarded = false;
        } else {
          report.name = "Anonymous";
          report.phone = null;
          report.address = null;
          report.userId = null;
          report.eligibleForReward = false;
          report.rewarded = false;
        }
        const result = await reportCollection.insertOne(report);
        console.log("Report created:", result.insertedId);
        res.status(201).json({
          success: true,
          message: reportData.isAnonymous
            ? "Anonymous report submitted successfully"
            : "Report submitted successfully",
          reportId: result.insertedId,
        });
      } catch (error) {
        console.error("Error creating report:", error);
        res.status(500).json({
          success: false,
          message: "Failed to submit report",
          error: error.message,
        });
      }
    });

    // GET all reports (for admin)
    app.get("/reports", async (req, res) => {
      try {
        const cursor = reportCollection.find().sort({ createdAt: -1 });
        const result = await cursor.toArray();
        res.status(200).json({
          success: true,
          count: result.length,
          data: result,
        });
      } catch (error) {
        console.error("Error fetching reports:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch reports",
          error: error.message,
        });
      }
    });

    app.get("/reports/user/:userId", async (req, res) => {
      try {
        const { userId } = req.params;
        const cursor = reportCollection
          .find({
            userId: userId,
            isAnonymous: false,
          })
          .sort({ createdAt: -1 });
        const result = await cursor.toArray();
        res.status(200).json({
          success: true,
          count: result.length,
          data: result,
        });
      } catch (error) {
        console.error("Error fetching user reports:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch user reports",
          error: error.message,
        });
      }
    });

    app.get("/reports/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid report ID format",
          });
        }
        const report = await reportCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!report) {
          return res.status(404).json({
            success: false,
            message: "Report not found",
          });
        }
        res.status(200).json({
          success: true,
          data: report,
        });
      } catch (error) {
        console.error("Error fetching report:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch report",
          error: error.message,
        });
      }
    });

    app.patch("/reports/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { status, adminNotes } = req.body;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid report ID format",
          });
        }
        const validStatuses = [
          "pending",
          "under-review",
          "resolved",
          "rejected",
        ];
        if (status && !validStatuses.includes(status)) {
          return res.status(400).json({
            success: false,
            message:
              "Invalid status. Must be one of: pending, under-review, resolved, rejected",
          });
        }
        const updateDoc = {
          $set: {
            updatedAt: new Date(),
          },
        };
        if (status) {
          updateDoc.$set.status = status;
        }
        if (adminNotes) {
          updateDoc.$set.adminNotes = adminNotes;
        }
        const result = await reportCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );
        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Report not found",
          });
        }
        res.status(200).json({
          success: true,
          message: "Report updated successfully",
        });
      } catch (error) {
        console.error("Error updating report:", error);
        res.status(500).json({
          success: false,
          message: "Failed to update report",
          error: error.message,
        });
      }
    });

    app.patch("/reports/:id/reward", async (req, res) => {
      try {
        const { id } = req.params;
        const { rewardAmount, rewardMessage } = req.body;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid report ID format",
          });
        }
        const report = await reportCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!report) {
          return res.status(404).json({
            success: false,
            message: "Report not found",
          });
        }
        if (report.isAnonymous || !report.eligibleForReward) {
          return res.status(400).json({
            success: false,
            message: "This report is not eligible for rewards",
          });
        }
        if (report.rewarded) {
          return res.status(400).json({
            success: false,
            message: "Reward has already been given for this report",
          });
        }
        const updateDoc = {
          $set: {
            rewarded: true,
            rewardAmount: rewardAmount || null,
            rewardMessage: rewardMessage || "",
            rewardedAt: new Date(),
            updatedAt: new Date(),
          },
        };
        const result = await reportCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );
        res.status(200).json({
          success: true,
          message: "Reward processed successfully",
        });
      } catch (error) {
        console.error("Error processing reward:", error);
        res.status(500).json({
          success: false,
          message: "Failed to process reward",
          error: error.message,
        });
      }
    });

    app.delete("/reports/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid report ID format",
          });
        }
        const result = await reportCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Report not found",
          });
        }
        res.status(200).json({
          success: true,
          message: "Report deleted successfully",
        });
      } catch (error) {
        console.error("Error deleting report:", error);
        res.status(500).json({
          success: false,
          message: "Failed to delete report",
          error: error.message,
        });
      }
    });

    app.get("/reports/stats/overview", async (req, res) => {
      try {
        const totalReports = await reportCollection.countDocuments();
        const anonymousReports = await reportCollection.countDocuments({
          isAnonymous: true,
        });
        const pendingReports = await reportCollection.countDocuments({
          status: "pending",
        });
        const underReviewReports = await reportCollection.countDocuments({
          status: "under-review",
        });
        const resolvedReports = await reportCollection.countDocuments({
          status: "resolved",
        });
        const rejectedReports = await reportCollection.countDocuments({
          status: "rejected",
        });
        const rewardedReports = await reportCollection.countDocuments({
          rewarded: true,
        });
        res.status(200).json({
          success: true,
          data: {
            total: totalReports,
            anonymous: anonymousReports,
            nonAnonymous: totalReports - anonymousReports,
            pending: pendingReports,
            underReview: underReviewReports,
            resolved: resolvedReports,
            rejected: rejectedReports,
            rewarded: rewardedReports,
          },
        });
      } catch (error) {
        console.error("Error fetching stats:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch statistics",
          error: error.message,
        });
      }
    });

    app.get("/reports/division/:division", async (req, res) => {
      try {
        const { division } = req.params;
        const cursor = reportCollection
          .find({ incidentDivision: division })
          .sort({ createdAt: -1 });
        const result = await cursor.toArray();
        res.status(200).json({
          success: true,
          count: result.length,
          data: result,
        });
      } catch (error) {
        console.error("Error fetching division reports:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch division reports",
          error: error.message,
        });
      }
    });

    // ========== NEW ACC FORM ENDPOINTS ==========

    // POST endpoint to create ACC form report with file uploads
    app.post(
      "/acc-form-reports",
      upload.array("evidence", 5),
      async (req, res) => {
        try {
          const formData = JSON.parse(req.body.formData);
          const witnesses = JSON.parse(req.body.witnesses);

          // Validate required fields
          if (
            !formData.fullName ||
            !formData.nid ||
            !formData.mobile ||
            !formData.address
          ) {
            return res.status(400).json({
              success: false,
              message: "Missing required complainant information",
            });
          }

          if (!formData.accusedName || !formData.accusedOffice) {
            return res.status(400).json({
              success: false,
              message: "Missing required accused party information",
            });
          }

          if (
            !formData.incidentDate ||
            !formData.incidentLocation ||
            !formData.incidentDivision ||
            !formData.corruptionType ||
            !formData.description
          ) {
            return res.status(400).json({
              success: false,
              message: "Missing required incident details",
            });
          }

          // Generate reference number
          const now = new Date();
          const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
          const randomPart = Math.floor(1000 + Math.random() * 9000);
          const referenceNumber = `ACC-${datePart}-${randomPart}`;

          // Process uploaded files
          const evidenceFiles = req.files
            ? req.files.map((file) => ({
                originalName: file.originalname,
                filename: file.filename,
                path: file.path,
                size: file.size,
                mimetype: file.mimetype,
                uploadedAt: new Date(),
              }))
            : [];

          // Create the report document
          const accReport = {
            referenceNumber,

            // Complainant Information
            complainant: {
              fullName: formData.fullName,
              nid: formData.nid,
              mobile: formData.mobile,
              email: formData.email || null,
              profession: formData.profession || null,
              address: formData.address,
            },

            // Accused Information
            accused: {
              name: formData.accusedName,
              position: formData.accusedPosition || null,
              office: formData.accusedOffice,
              address: formData.accusedAddress || null,
            },

            // Incident Details
            incident: {
              date: formData.incidentDate,
              time: formData.incidentTime || null,
              location: formData.incidentLocation,
              division: formData.incidentDivision,
              corruptionType: formData.corruptionType,
              amountInvolved: formData.amount
                ? parseFloat(formData.amount)
                : null,
              description: formData.description,
            },

            // Witness Information
            witnesses: witnesses.filter((w) => w.name || w.contact),

            // Evidence Files
            evidence: evidenceFiles,

            // Status and Tracking
            status: "pending", // pending, under-investigation, resolved, rejected
            submittedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),

            // Additional metadata
            ipAddress: req.ip,
            userAgent: req.get("user-agent"),
          };

          // Insert into database
          const result = await accFormCollection.insertOne(accReport);

          console.log("ACC Form Report created:", result.insertedId);

          res.status(201).json({
            success: true,
            message: "ACC Form report submitted successfully",
            referenceNumber: referenceNumber,
            reportId: result.insertedId,
            filesUploaded: evidenceFiles.length,
          });
        } catch (error) {
          console.error("Error creating ACC form report:", error);

          // Clean up uploaded files if database insertion fails
          if (req.files) {
            req.files.forEach((file) => {
              fs.unlink(file.path, (err) => {
                if (err) console.error("Error deleting file:", err);
              });
            });
          }

          res.status(500).json({
            success: false,
            message: "Failed to submit ACC form report",
            error: error.message,
          });
        }
      }
    );

    // GET all ACC form reports (for admin)
    app.get("/acc-form-reports", async (req, res) => {
      try {
        const cursor = accFormCollection.find().sort({ createdAt: -1 });
        const result = await cursor.toArray();
        res.status(200).json({
          success: true,
          count: result.length,
          data: result,
        });
      } catch (error) {
        console.error("Error fetching ACC form reports:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch ACC form reports",
          error: error.message,
        });
      }
    });

    // GET single ACC form report by ID
    app.get("/acc-form-reports/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid report ID format",
          });
        }

        const report = await accFormCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!report) {
          return res.status(404).json({
            success: false,
            message: "Report not found",
          });
        }

        res.status(200).json({
          success: true,
          data: report,
        });
      } catch (error) {
        console.error("Error fetching ACC form report:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch report",
          error: error.message,
        });
      }
    });

    // GET ACC form report by reference number
    app.get(
      "/acc-form-reports/reference/:referenceNumber",
      async (req, res) => {
        try {
          const { referenceNumber } = req.params;

          const report = await accFormCollection.findOne({
            referenceNumber: referenceNumber,
          });

          if (!report) {
            return res.status(404).json({
              success: false,
              message: "Report not found with this reference number",
            });
          }

          res.status(200).json({
            success: true,
            data: report,
          });
        } catch (error) {
          console.error("Error fetching ACC form report:", error);
          res.status(500).json({
            success: false,
            message: "Failed to fetch report",
            error: error.message,
          });
        }
      }
    );

    // UPDATE ACC form report status
    app.patch("/acc-form-reports/:id/status", async (req, res) => {
      try {
        const { id } = req.params;
        const { status, punishment, adminNotes } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid report ID format",
          });
        }

        const validStatuses = [
          "pending",
          "investigation",
          "ongoing",
          "convicted",
          "appealed",
          "dismissed",
        ];

        if (status && !validStatuses.includes(status)) {
          return res.status(400).json({
            success: false,
            message: `Invalid status. Must be one of: ${validStatuses.join(
              ", "
            )}`,
          });
        }

        const updateDoc = {
          $set: {
            status: status,
            updatedAt: new Date(),
          },
        };

        if (punishment !== undefined) {
          updateDoc.$set.punishment = punishment;
        }

        if (adminNotes) {
          updateDoc.$set.adminNotes = adminNotes;
        }

        const result = await accFormCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Case not found",
          });
        }

        res.status(200).json({
          success: true,
          message: "Case status updated successfully",
        });
      } catch (error) {
        console.error("Error updating case status:", error);
        res.status(500).json({
          success: false,
          message: "Failed to update case status",
          error: error.message,
        });
      }
    });

    // DELETE ACC form report
    app.delete("/acc-form-reports/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid report ID format",
          });
        }

        // Get report to delete associated files
        const report = await accFormCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!report) {
          return res.status(404).json({
            success: false,
            message: "Report not found",
          });
        }

        // Delete associated files
        if (report.evidence && report.evidence.length > 0) {
          report.evidence.forEach((file) => {
            fs.unlink(file.path, (err) => {
              if (err) console.error("Error deleting file:", err);
            });
          });
        }

        // Delete report from database
        const result = await accFormCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.status(200).json({
          success: true,
          message: "Report and associated files deleted successfully",
        });
      } catch (error) {
        console.error("Error deleting ACC form report:", error);
        res.status(500).json({
          success: false,
          message: "Failed to delete report",
          error: error.message,
        });
      }
    });

    // GET ACC form statistics
    app.get("/acc-form-reports/stats/overview", async (req, res) => {
      try {
        const totalReports = await accFormCollection.countDocuments();
        const pendingReports = await accFormCollection.countDocuments({
          status: "pending",
        });
        const underInvestigationReports =
          await accFormCollection.countDocuments({
            status: "under-investigation",
          });
        const resolvedReports = await accFormCollection.countDocuments({
          status: "resolved",
        });
        const rejectedReports = await accFormCollection.countDocuments({
          status: "rejected",
        });

        // Get reports by corruption type
        const briberyReports = await accFormCollection.countDocuments({
          "incident.corruptionType": "bribe",
        });
        const embezzlementReports = await accFormCollection.countDocuments({
          "incident.corruptionType": "embezzlement",
        });
        const abuseReports = await accFormCollection.countDocuments({
          "incident.corruptionType": "abuse",
        });

        res.status(200).json({
          success: true,
          data: {
            total: totalReports,
            pending: pendingReports,
            underInvestigation: underInvestigationReports,
            resolved: resolvedReports,
            rejected: rejectedReports,
            byType: {
              bribery: briberyReports,
              embezzlement: embezzlementReports,
              abuse: abuseReports,
            },
          },
        });
      } catch (error) {
        console.error("Error fetching ACC form stats:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch statistics",
          error: error.message,
        });
      }
    });

    // GET heatmap statistics from ACC form reports
    app.get("/api/heatmap/statistics", async (req, res) => {
      try {
        // Get all ACC form reports
        const allReports = await accFormCollection.find().toArray();

        // Initialize division data structure
        const divisions = [
          "Dhaka",
          "Chittagong",
          "Rajshahi",
          "Khulna",
          "Barishal",
          "Sylhet",
          "Rangpur",
          "Mymensingh",
        ];

        const divisionStats = divisions.map((division) => {
          const divisionReports = allReports.filter(
            (report) => report.incident.division === division
          );

          const reportedCases = divisionReports.length;
          const solvedCases = divisionReports.filter((report) =>
            ["convicted", "dismissed"].includes(report.status)
          ).length;
          const activeCases = divisionReports.filter((report) =>
            ["pending", "investigation", "ongoing", "appealed"].includes(
              report.status
            )
          ).length;

          return {
            division,
            reportedCases,
            solvedCases,
            activeCases,
          };
        });

        // Calculate overall statistics
        const totalReported = allReports.length;
        const totalSolved = allReports.filter((report) =>
          ["convicted", "dismissed"].includes(report.status)
        ).length;
        const totalActive = allReports.filter((report) =>
          ["pending", "investigation", "ongoing", "appealed"].includes(
            report.status
          )
        ).length;

        // Find divisions with highest counts
        const highestReported = divisionStats.reduce(
          (max, item) =>
            item.reportedCases > max.count
              ? { division: item.division, count: item.reportedCases }
              : max,
          { division: "", count: 0 }
        );

        const highestSolved = divisionStats.reduce(
          (max, item) =>
            item.solvedCases > max.count
              ? { division: item.division, count: item.solvedCases }
              : max,
          { division: "", count: 0 }
        );

        res.status(200).json({
          success: true,
          data: {
            totalReported,
            totalSolved,
            totalActive,
            highestReported,
            highestSolved,
            divisionData: divisionStats,
          },
        });
      } catch (error) {
        console.error("Error fetching heatmap statistics:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch heatmap statistics",
          error: error.message,
        });
      }
    });

    // GET dashboard statistics
    app.get("/api/dashboard/statistics", async (req, res) => {
      try {
        // Get corruption reports statistics
        const totalReports = await reportCollection.countDocuments();
        const pendingReports = await reportCollection.countDocuments({
          status: "pending",
        });
        const underReviewReports = await reportCollection.countDocuments({
          status: "under-review",
        });
        const resolvedReports = await reportCollection.countDocuments({
          status: "resolved",
        });
        const rejectedReports = await reportCollection.countDocuments({
          status: "rejected",
        });

        // Get ACC form cases statistics
        const totalCases = await accFormCollection.countDocuments();
        const pendingCases = await accFormCollection.countDocuments({
          status: "pending",
        });
        const activeCases = await accFormCollection.countDocuments({
          status: { $in: ["investigation", "ongoing", "appealed"] },
        });
        const convictedCases = await accFormCollection.countDocuments({
          status: "convicted",
        });
        const dismissedCases = await accFormCollection.countDocuments({
          status: "dismissed",
        });

        // Get registered users count
        const totalUsers = await registrationCollection.countDocuments();

        // Combined statistics
        const totalPending = pendingReports + pendingCases;
        const totalActive = underReviewReports + activeCases;
        const totalResolved = resolvedReports + convictedCases + dismissedCases;
        const combinedTotal = totalReports + totalCases;

        // Get recent activity (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentReports = await reportCollection.countDocuments({
          createdAt: { $gte: thirtyDaysAgo },
        });

        const recentCases = await accFormCollection.countDocuments({
          createdAt: { $gte: thirtyDaysAgo },
        });

        // Get division-wise breakdown
        const divisionBreakdown = await accFormCollection
          .aggregate([
            {
              $group: {
                _id: "$incident.division",
                count: { $sum: 1 },
              },
            },
            {
              $sort: { count: -1 },
            },
            {
              $limit: 5,
            },
          ])
          .toArray();

        // Get corruption type breakdown
        const typeBreakdown = await accFormCollection
          .aggregate([
            {
              $group: {
                _id: "$incident.corruptionType",
                count: { $sum: 1 },
              },
            },
            {
              $sort: { count: -1 },
            },
          ])
          .toArray();

        res.status(200).json({
          success: true,
          data: {
            overview: {
              totalReports: combinedTotal,
              pendingCases: totalPending,
              activeCases: totalActive,
              resolvedCases: totalResolved,
              registeredUsers: totalUsers,
            },
            reports: {
              total: totalReports,
              pending: pendingReports,
              underReview: underReviewReports,
              resolved: resolvedReports,
              rejected: rejectedReports,
            },
            cases: {
              total: totalCases,
              pending: pendingCases,
              investigation: await accFormCollection.countDocuments({
                status: "investigation",
              }),
              ongoing: await accFormCollection.countDocuments({
                status: "ongoing",
              }),
              convicted: convictedCases,
              appealed: await accFormCollection.countDocuments({
                status: "appealed",
              }),
              dismissed: dismissedCases,
            },
            recentActivity: {
              last30Days: {
                reports: recentReports,
                cases: recentCases,
                total: recentReports + recentCases,
              },
            },
            breakdown: {
              byDivision: divisionBreakdown.map((item) => ({
                division: item._id,
                count: item.count,
              })),
              byType: typeBreakdown.map((item) => ({
                type: item._id,
                count: item.count,
              })),
            },
          },
        });
      } catch (error) {
        console.error("Error fetching dashboard statistics:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch dashboard statistics",
          error: error.message,
        });
      }
    });

    // ==================== TRAINERS ENDPOINTS ====================

    // GET all trainers
    app.get("/trainers", async (req, res) => {
      try {
        const cursor = trainersCollection.find().sort({ uploadDate: -1 });
        const result = await cursor.toArray();
        res.status(200).json({
          success: true,
          count: result.length,
          data: result,
        });
      } catch (error) {
        console.error("Error fetching trainers:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch trainers",
          error: error.message,
        });
      }
    });

    // POST - Create new trainer
    app.post("/trainers", async (req, res) => {
      try {
        const trainerData = {
          ...req.body,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await trainersCollection.insertOne(trainerData);

        res.status(201).json({
          success: true,
          message: "Trainer added successfully",
          data: { _id: result.insertedId, ...trainerData },
        });
      } catch (error) {
        console.error("Error creating trainer:", error);
        res.status(500).json({
          success: false,
          message: "Failed to create trainer",
          error: error.message,
        });
      }
    });

    // POST - Upload trainer photo
    app.post(
      "/upload/trainer-photo",
      uploadTrainerPhoto.single("photo"),
      (req, res) => {
        try {
          if (!req.file) {
            return res.status(400).json({
              success: false,
              message: "No file uploaded",
            });
          }

          const photoPath = req.file.path.replace(/\\/g, "/");

          res.status(200).json({
            success: true,
            message: "Photo uploaded successfully",
            data: {
              filename: req.file.filename,
              path: photoPath,
              url: `${req.protocol}://${req.get("host")}/${photoPath}`,
            },
          });
        } catch (error) {
          console.error("Error uploading trainer photo:", error);
          res.status(500).json({
            success: false,
            message: "Failed to upload photo",
            error: error.message,
          });
        }
      }
    );

    // DELETE - Remove trainer photo
    app.delete("/upload/trainer-photo/:filename", (req, res) => {
      try {
        const { filename } = req.params;
        const filePath = path.join("uploads", "trainers", filename);

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          res.status(200).json({
            success: true,
            message: "Photo deleted successfully",
          });
        } else {
          res.status(404).json({
            success: false,
            message: "Photo not found",
          });
        }
      } catch (error) {
        console.error("Error deleting trainer photo:", error);
        res.status(500).json({
          success: false,
          message: "Failed to delete photo",
          error: error.message,
        });
      }
    });

    // PUT - Update trainer
    app.put("/trainers/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid trainer ID format",
          });
        }

        const updateData = {
          ...req.body,
          updatedAt: new Date(),
        };

        delete updateData._id;

        const result = await trainersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Trainer not found",
          });
        }

        res.status(200).json({
          success: true,
          message: "Trainer updated successfully",
        });
      } catch (error) {
        console.error("Error updating trainer:", error);
        res.status(500).json({
          success: false,
          message: "Failed to update trainer",
          error: error.message,
        });
      }
    });

    // DELETE trainer
    app.delete("/trainers/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid trainer ID format",
          });
        }

        const result = await trainersCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Trainer not found",
          });
        }

        res.status(200).json({
          success: true,
          message: "Trainer deleted successfully",
        });
      } catch (error) {
        console.error("Error deleting trainer:", error);
        res.status(500).json({
          success: false,
          message: "Failed to delete trainer",
          error: error.message,
        });
      }
    });

    // ==================== EVENTS ENDPOINTS ====================

    // GET all events
    app.get("/education-events", async (req, res) => {
      try {
        const cursor = eventsCollection.find().sort({ date: -1 });
        const result = await cursor.toArray();
        res.status(200).json({
          success: true,
          count: result.length,
          data: result,
        });
      } catch (error) {
        console.error("Error fetching events:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch events",
          error: error.message,
        });
      }
    });

    // POST - Create new event
    app.post("/education-events", async (req, res) => {
      try {
        const eventData = {
          ...req.body,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await eventsCollection.insertOne(eventData);

        res.status(201).json({
          success: true,
          message: "Event added successfully",
          data: { _id: result.insertedId, ...eventData },
        });
      } catch (error) {
        console.error("Error creating event:", error);
        res.status(500).json({
          success: false,
          message: "Failed to create event",
          error: error.message,
        });
      }
    });

    // PUT - Update event
    app.put("/education-events/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid event ID format",
          });
        }

        const updateData = {
          ...req.body,
          updatedAt: new Date(),
        };

        delete updateData._id;

        const result = await eventsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Event not found",
          });
        }

        res.status(200).json({
          success: true,
          message: "Event updated successfully",
        });
      } catch (error) {
        console.error("Error updating event:", error);
        res.status(500).json({
          success: false,
          message: "Failed to update event",
          error: error.message,
        });
      }
    });

    // DELETE event
    app.delete("/education-events/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid event ID format",
          });
        }

        const result = await eventsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Event not found",
          });
        }

        res.status(200).json({
          success: true,
          message: "Event deleted successfully",
        });
      } catch (error) {
        console.error("Error deleting event:", error);
        res.status(500).json({
          success: false,
          message: "Failed to delete event",
          error: error.message,
        });
      }
    });

    // ========== GOVERNMENT SPENDING ENDPOINTS ==========

    // GET all government spending items
    app.get("/api/govt-spending", async (req, res) => {
      try {
        const cursor = govtSpendingCollection.find().sort({ createdAt: -1 });
        const result = await cursor.toArray();
        res.status(200).json({
          success: true,
          count: result.length,
          data: result,
        });
      } catch (error) {
        console.error("Error fetching govt spending:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch government spending items",
          error: error.message,
        });
      }
    });

    // POST - Create new government spending item (updated)
    app.post("/api/govt-spending", async (req, res) => {
      try {
        const { name, budget, actual, color, year } = req.body;

        if (!name || budget === undefined || actual === undefined || !color) {
          return res.status(400).json({
            success: false,
            message: "All fields (name, budget, actual, color) are required",
          });
        }

        const spendingItem = {
          name: String(name).trim(),
          budget: Number(budget),
          actual: Number(actual),
          color: String(color),
          year: year || new Date().getFullYear().toString(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await govtSpendingCollection.insertOne(spendingItem);

        res.status(201).json({
          success: true,
          message: "Government spending item added successfully",
          data: { _id: result.insertedId, ...spendingItem },
        });
      } catch (error) {
        console.error("Error creating govt spending item:", error);
        res.status(500).json({
          success: false,
          message: "Failed to create government spending item",
          error: error.message,
        });
      }
    });

    // PUT - Update government spending item (updated)
    app.put("/api/govt-spending/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { name, budget, actual, color, year } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid spending item ID format",
          });
        }

        if (!name || budget === undefined || actual === undefined || !color) {
          return res.status(400).json({
            success: false,
            message: "All fields (name, budget, actual, color) are required",
          });
        }

        const updateDoc = {
          $set: {
            name: String(name).trim(),
            budget: Number(budget),
            actual: Number(actual),
            color: String(color),
            year: year || new Date().getFullYear().toString(),
            updatedAt: new Date(),
          },
        };

        const result = await govtSpendingCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Government spending item not found",
          });
        }

        res.status(200).json({
          success: true,
          message: "Government spending item updated successfully",
        });
      } catch (error) {
        console.error("Error updating govt spending item:", error);
        res.status(500).json({
          success: false,
          message: "Failed to update government spending item",
          error: error.message,
        });
      }
    });

    // DELETE government spending item
    app.delete("/api/govt-spending/:id", async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({
            success: false,
            message: "Invalid spending item ID format",
          });
        }

        const result = await govtSpendingCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({
            success: false,
            message: "Government spending item not found",
          });
        }

        res.status(200).json({
          success: true,
          message: "Government spending item deleted successfully",
        });
      } catch (error) {
        console.error("Error deleting govt spending item:", error);
        res.status(500).json({
          success: false,
          message: "Failed to delete government spending item",
          error: error.message,
        });
      }
    });

    // GET yearly spending data
    app.get("/api/govt-spending/yearly", async (req, res) => {
      try {
        const pipeline = [
          {
            $group: {
              _id: "$year",
              budget: { $sum: "$budget" },
              actual: { $sum: "$actual" },
            },
          },
          {
            $project: {
              _id: 0,
              year: "$_id",
              budget: 1,
              actual: 1,
            },
          },
          {
            $sort: { year: 1 },
          },
        ];

        const yearlyData = await govtSpendingCollection
          .aggregate(pipeline)
          .toArray();

        res.status(200).json({
          success: true,
          data: yearlyData,
        });
      } catch (error) {
        console.error("Error fetching yearly spending data:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch yearly spending data",
          error: error.message,
        });
      }
    });

    // GET government spending statistics
    app.get("/api/govt-spending/stats/overview", async (req, res) => {
      try {
        const allItems = await govtSpendingCollection.find().toArray();

        const totalBudget = allItems.reduce(
          (sum, item) => sum + Number(item.budget),
          0
        );
        const totalActual = allItems.reduce(
          (sum, item) => sum + Number(item.actual),
          0
        );
        const totalVariance = totalActual - totalBudget;
        const variancePercent =
          totalBudget > 0
            ? ((totalVariance / totalBudget) * 100).toFixed(2)
            : 0;

        res.status(200).json({
          success: true,
          data: {
            totalItems: allItems.length,
            totalBudget,
            totalActual,
            totalVariance,
            variancePercent: parseFloat(variancePercent),
            items: allItems,
          },
        });
      } catch (error) {
        console.error("Error fetching govt spending stats:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch government spending statistics",
          error: error.message,
        });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB!");
  } finally {
    // Don't close the connection
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Transparency Bangladesh API is running");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
