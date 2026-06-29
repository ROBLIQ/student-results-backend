const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const lecturerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    department: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

lecturerSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

lecturerSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

lecturerSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model("Lecturer", lecturerSchema);
