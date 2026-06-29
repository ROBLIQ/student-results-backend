// Grading scale: Test /10, Assignment /10, Attendance /10, Exam /70 = Total /100
// Pass mark: 40

function getGrade(total) {
  if (total >= 70) return "A";
  if (total >= 60) return "B";
  if (total >= 50) return "C";
  if (total >= 45) return "D";
  if (total >= 40) return "E";
  return "F";
}

function getStatus(total) {
  return total >= 40 ? "PASS" : "FAIL";
}

module.exports = { getGrade, getStatus };
