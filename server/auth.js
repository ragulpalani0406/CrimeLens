import dotenv from "dotenv";
dotenv.config({ override: true });
import mongoose from "mongoose";
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = Router();
const COOKIE_NAME = "crimelens_token";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 1000 * 60 * 60 * 8,
};

// ── Mongoose User Schema ───────────────────────────────────────────────────────
const userSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true },
    email:        { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role:         { type: String, default: "ANALYST" },
    avatarUrl:    { type: String, default: null },
    language:     { type: String, default: "en" },
  },
  { timestamps: true }
);

// Avoid OverwriteModelError on hot-reload
const User = mongoose.models.User ?? mongoose.model("User", userSchema);

// ── Helpers ───────────────────────────────────────────────────────────────────
function safeUser(user) {
  return {
    id:        user._id.toString(),
    name:      user.name,
    email:     user.email,
    role:      user.role,
    avatarUrl: user.avatarUrl ?? null,
    language:  user.language,
  };
}

function createToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
}

async function requireLogin(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ message: "Please log in first." });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.userId);

    if (!user) return res.status(401).json({ message: "User account not found." });

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Your login session has expired." });
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  try {
    const name     = String(req.body.name || "").trim();
    const email    = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email || password.length < 8) {
      return res.status(400).json({
        message: "Enter name, valid email, and a password with at least 8 characters.",
      });
    }

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: "This email is already registered." });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash, role: "ANALYST" });

    const token = createToken(user);
    res.cookie(COOKIE_NAME, token, cookieOptions);
    res.status(201).json({ user: safeUser(user) });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Could not create the account." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email    = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = createToken(user);
    res.cookie(COOKIE_NAME, token, cookieOptions);
    res.json({ user: safeUser(user) });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Could not log in." });
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions);
  res.json({ message: "Logged out successfully." });
});

router.get("/me", requireLogin, (req, res) => {
  res.json({ user: safeUser(req.user) });
});

router.patch("/profile", requireLogin, async (req, res) => {
  try {
    const name      = String(req.body.name      || req.user.name).trim();
    const language  = String(req.body.language  || req.user.language);
    const avatarUrl = String(req.body.avatarUrl || req.user.avatarUrl || "").trim();

    req.user.name      = name;
    req.user.language  = language;
    req.user.avatarUrl = avatarUrl || null;
    await req.user.save();

    res.json({ user: safeUser(req.user) });
  } catch {
    res.status(500).json({ message: "Could not update profile." });
  }
});

export default router;