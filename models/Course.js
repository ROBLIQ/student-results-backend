const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    title: { type: String, required: true, trim: true },
    lecturer: { type: mongoose.Schema.Types.ObjectId, ref: "Lecturer", required: true },
  },
  { timestamps: true }
);

// a lecturer cannot have two courses with the same code
courseSchema.index({ lecturer: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Course", courseSchema);
