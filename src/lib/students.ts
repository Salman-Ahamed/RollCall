/**
 * Hardcoded student list for RollCall.
 * Edit this array to add, remove, or update students.
 * Each student needs a unique `id`, plus `name` and `phone`.
 */

export interface Student {
  id: string;
  name: string;
  phone: string;
}

export const STUDENTS: Student[] = [
  { id: "1", name: "Aisha Rahman", phone: "01711-111111" },
  { id: "2", name: "Fahim Hasan", phone: "01722-222222" },
  { id: "3", name: "Nusrat Jahan", phone: "01733-333333" },
  { id: "4", name: "Rafiq Ahmed", phone: "01744-444444" },
  { id: "5", name: "Tasnim Akter", phone: "01755-555555" },
  { id: "6", name: "Imran Kabir", phone: "01766-666666" },
  { id: "7", name: "Sabrina Islam", phone: "01777-777777" },
  { id: "8", name: "Mahir Uddin", phone: "01788-888888" },
  { id: "9", name: "Fariha Naznin", phone: "01799-999999" },
  { id: "10", name: "Omar Sharif", phone: "01700-000000" },
  { id: "11", name: "Ritu Chowdhury", phone: "01811-111111" },
  { id: "12", name: "Sohel Rana", phone: "01822-222222" },
  { id: "13", name: "Mithila Das", phone: "01833-333333" },
  { id: "14", name: "Kamal Hossain", phone: "01844-444444" },
  { id: "15", name: "Nafisa Begum", phone: "01855-555555" },
];
