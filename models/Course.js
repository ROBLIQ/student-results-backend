const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    code:     { type: String, required: true, trim: true, uppercase: true },
    title:    { type: String, required: true, trim: true },
    lecturer: { type: mongoose.Schema.Types.ObjectId, ref: "Lecturer", required: true },
    // New fields
    level:    { type: String, trim: true, default: "" }, // e.g. ND I, ND II, HND I, HND II
    semester: { type: String, trim: true, default: "" }, // First or Second
    session:  { type: String, trim: true, default: "" }, // e.g. 2024/2025
  },
  { timestamps: true }
);

courseSchema.index({ lecturer: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Course", courseSchema);