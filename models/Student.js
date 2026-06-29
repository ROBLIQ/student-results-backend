const mongoose = require("mongoose");
const { getGrade, getStatus } = require("../utils/grading");

const studentSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    matric: { type: String, trim: true, default: "" },
    name: { type: String, trim: true, default: "" },
    test: { type: Number, default: 0, min: 0, max: 10 },
    assignment: { type: Number, default: 0, min: 0, max: 10 },
    attendance: { type: Number, default: 0, min: 0, max: 10 },
    exam: { type: Number, default: 0, min: 0, max: 70 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

studentSchema.virtual("total").get(function () {
  return this.test + this.assignment + this.attendance + this.exam;
});

studentSchema.virtual("grade").get(function () {
  return getGrade(this.total);
});

studentSchema.virtual("status").get(function () {
  return getStatus(this.total);
});

module.exports = mongoose.model("Student", studentSchema);
