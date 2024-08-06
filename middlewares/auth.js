const jwt = require("jsonwebtoken");

// Middleware untuk memeriksa otentikasi
function isAuthenticated(req, res, next) {
  const authHeader = req.headers["authorization"];
  //   console.log("Authorization header:", authHeader);
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    console.log("No token provided");
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, "your_jwt_secret_key");
    req.user = decoded;
    console.log("Decoded token:", decoded);
    next();
  } catch (error) {
    console.log("Invalid token:", error.message);
    res.status(400).json({ message: "Invalid token." });
  }
}

// Middleware untuk memeriksa peran pengguna
function hasRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      console.log(`Akses ditolak untuk role ${role} - User ID: ${req.user.id}`);
      return res.status(403).json({
        message: "Forbidden. You do not have access to this resource.",
      });
    }
    next();
  };
}

module.exports = { isAuthenticated, hasRole };
