// ══════════════════════════════════════════════════════════════════════════════
//  SEED — Datos iniciales de BiblioGest
//  Este archivo solo se usa la PRIMERA VEZ que la app se conecta a la base de
//  datos (Firestore) y no encuentra información todavía. A partir de ahí,
//  todos los cambios (préstamos, usuarios, libros, contraseñas) se guardan y
//  se leen directamente desde Firestore, compartidos entre todos los
//  dispositivos que abran la página.
// ══════════════════════════════════════════════════════════════════════════════
const SEED = {
  "libros": [
    { "id": 1, "codigo": "LIB-001", "titulo": "Cien Años de Soledad", "autor": "Gabriel García Márquez", "editorial": "Sudamericana", "anio": "1967", "genero": "Novela", "disponible": 1, "fecha_alta": "2026-05-14 13:40:03" },
    { "id": 2, "codigo": "LIB-002", "titulo": "El Principito", "autor": "Antoine de Saint-Exupéry", "editorial": "Gallimard", "anio": "1943", "genero": "Infantil", "disponible": 1, "fecha_alta": "2026-05-14 13:40:03" },
    { "id": 3, "codigo": "LIB-003", "titulo": "Don Quijote de la Mancha", "autor": "Miguel de Cervantes", "editorial": "Francisco de Robles", "anio": "1605", "genero": "Clásico", "disponible": 1, "fecha_alta": "2026-05-14 13:40:03" },
    { "id": 4, "codigo": "LIB-004", "titulo": "La Sombra del Viento", "autor": "Carlos Ruiz Zafón", "editorial": "Planeta", "anio": "2001", "genero": "Misterio", "disponible": 1, "fecha_alta": "2026-05-14 13:40:03" },
    { "id": 5, "codigo": "LIB-005", "titulo": "Harry Potter y la Piedra Filosofal", "autor": "J.K. Rowling", "editorial": "Bloomsbury", "anio": "1997", "genero": "Fantasía", "disponible": 1, "fecha_alta": "2026-05-14 13:40:03" },
    { "id": 6, "codigo": "LIB-006", "titulo": "Matemáticas para la Vida Diaria", "autor": "Varios Autores", "editorial": "SEP", "anio": "2020", "genero": "Educativo", "disponible": 1, "fecha_alta": "2026-05-14 13:40:03" },
    { "id": 7, "codigo": "LIB-007", "titulo": "Historia de México", "autor": "Enrique Florescano", "editorial": "FCE", "anio": "2010", "genero": "Historia", "disponible": 1, "fecha_alta": "2026-05-14 13:40:03" },
    { "id": 8, "codigo": "LIB-008", "titulo": "El Alquimista", "autor": "Paulo Coelho", "editorial": "Rocco", "anio": "1988", "genero": "Novela", "disponible": 1, "fecha_alta": "2026-05-14 13:40:03" }
  ],
  "usuarios": [
    { "id": 1, "curp": "LEVK061006HCHDLVA1", "nombre": "Kevin Daniel", "apellidos": "Ledesma Villanueva", "telefono": "6271101785", "password": "ef797c8118f02dfb649607dd5d3f8c7623048c9c063d532cc95c5ed7a898a64f", "es_menor": 0, "fecha_reg": "2026-05-14 13:44:42", "activo": 1 }
  ],
  "admins": [
    { "id": 1, "usuario": "admin", "password": "3b5701e21d2e07a2ca984b5f722e02109f16832be67064c6cc6c9e820b0a5853" }
  ]
};
