const mongoose = require("mongoose");
const { getGrade, getStatus } = require("../utils/grading");

const studentSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    matric: { type: String, trim: true, default: "" },
    name:   { type: String, trim: true, default: "" },
    // Eight exam question scores — their sum makes the Exam Total (capped at 70)
    q1: { type: Number, default: 0, min: 0 },
    q2: { type: Number, default: 0, min: 0 },
    q3: { type: Number, default: 0, min: 0 },
    q4: { type: Number, default: 0, min: 0 },
    q5: { type: Number, default: 0, min: 0 },
    q6: { type: Number, default: 0, min: 0 },
    q7: { type: Number, default: 0, min: 0 },
    q8: { type: Number, default: 0, min: 0 },
    // Continuous Assessment — out of 30
    ca: { type: Number, default: 0, min: 0, max: 30 },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

studentSchema.virtual("examTotal").get(function () {
  return Math.min(70, this.q1 + this.q2 + this.q3 + this.q4 + this.q5 + this.q6 + this.q7 + this.q8);
});

studentSchema.virtual("grandTotal").get(function () {
  return Math.min(100, this.examTotal + this.ca);
});

studentSchema.virtual("grade").get(function () {
  return getGrade(this.grandTotal);
});

studentSchema.virtual("status").get(function () {
  return getStatus(this.grandTotal);
});

module.exports = mongoose.model("Student", studentSchema);