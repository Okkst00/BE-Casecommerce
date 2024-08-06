// middlewares/authMiddleware.js
const jwt = require("jsonwebtoken");

const authenticateUser = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Ambil token dari header

  if (token == null)
    return res.status(401).json({ message: "No token provided" });

  jwt.verify(token, "your_jwt_secret_key", (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });

    req.user = user; // Simpan user dari token dalam request
    next();
  });
};

module.exports = authenticateUser;
