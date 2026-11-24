import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';
import '../models/glucose_models.dart';

class LocalDatabase {
  static const String dbName = 'glucosoft_local.db';
  static const int schemaVersion = 2;
  static const int maxProfiles = 3;

  Database? _db;

  Future<Database> get database async {
    if (_db != null && _db!.isOpen) return _db!;
    _db = await _initDatabase();
    return _db!;
  }

  Future<Database> _initDatabase() async {
    final dbPath = await getDatabasesPath();
    final fullPath = p.join(dbPath, dbName);

    return openDatabase(
      fullPath,
      version: schemaVersion,
      onConfigure: (db) async {
        await db.execute('PRAGMA foreign_keys = ON');
      },
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            preferred_unit TEXT NOT NULL DEFAULT 'mg/dL',
            target_min_mg_dl INTEGER NOT NULL DEFAULT 70,
            target_max_mg_dl INTEGER NOT NULL DEFAULT 140,
            emergency_name TEXT,
            emergency_phone TEXT,
            emergency_relation TEXT,
            created_at_ms INTEGER NOT NULL
          )
        ''');

        await db.execute('''
          CREATE TABLE readings (
            id TEXT PRIMARY KEY,
            profile_id TEXT NOT NULL,
            value_mg_dl INTEGER NOT NULL,
            unit_entered TEXT NOT NULL DEFAULT 'mg/dL',
            timestamp_ms INTEGER NOT NULL,
            context TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '',
            capture_method TEXT NOT NULL,
            device_model TEXT NOT NULL,
            device_info TEXT,
            FOREIGN KEY (profile_id) REFERENCES profiles (id) ON DELETE CASCADE
          )
        ''');

        await db.execute(
          'CREATE INDEX idx_readings_profile_time ON readings (profile_id, timestamp_ms DESC)',
        );
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          // Migración segura sin perder datos existentes de v1 -> v2
          await _safeAddColumn(db, 'profiles', 'target_min_mg_dl', 'INTEGER NOT NULL DEFAULT 70');
          await _safeAddColumn(db, 'profiles', 'target_max_mg_dl', 'INTEGER NOT NULL DEFAULT 140');
          await _safeAddColumn(db, 'readings', 'capture_method', "TEXT NOT NULL DEFAULT 'manual'");
          await _safeAddColumn(db, 'readings', 'device_info', 'TEXT');
        }
      },
    );
  }

  Future<void> _safeAddColumn(
    Database db,
    String table,
    String column,
    String definition,
  ) async {
    final cols = await db.rawQuery('PRAGMA table_info($table)');
    final exists = cols.any((c) => c['name'] == column);
    if (!exists) {
      await db.execute('ALTER TABLE $table ADD COLUMN $column $definition');
    }
  }

  Future<void> close() async {
    await _db?.close();
    _db = null;
  }

  // -------------------------
  // PERFILES (Máximo 3)
  // -------------------------

  Future<List<UserProfile>> getAllProfiles() async {
    final db = await database;
    final rows = await db.query('profiles', orderBy: 'created_at_ms ASC');
    return rows.map(UserProfile.fromDbMap).toList();
  }

  Future<int> getProfileCount() async {
    final db = await database;
    final res = await db.rawQuery('SELECT COUNT(*) AS cnt FROM profiles');
    return Sqflite.firstIntValue(res) ?? 0;
  }

  Future<UserProfile> createProfile({
    required String name,
    required GlucoseUnit preferredUnit,
  }) async {
    final cleanName = name.trim();
    if (cleanName.isEmpty) {
      throw ArgumentError('El nombre del perfil no puede estar vacío.');
    }

    final db = await database;
    final count = await getProfileCount();
    if (count >= maxProfiles) {
      throw StateError('Máximo 3 perfiles permitidos en este dispositivo.');
    }

    final profile = UserProfile(
      id: 'prof_${DateTime.now().microsecondsSinceEpoch}',
      name: cleanName,
      preferredUnit: preferredUnit,
      createdAtMs: DateTime.now().millisecondsSinceEpoch,
    );

    await db.insert('profiles', profile.toDbMap());
    return profile;
  }

  Future<void> updateProfile(UserProfile profile) async {
    final db = await database;
    await db.update(
      'profiles',
      profile.toDbMap(),
      where: 'id = ?',
      whereArgs: [profile.id],
    );
  }

  Future<int> countReadingsForProfile(String profileId) async {
    final db = await database;
    final res = await db.rawQuery(
      'SELECT COUNT(*) AS cnt FROM readings WHERE profile_id = ?',
      [profileId],
    );
    return Sqflite.firstIntValue(res) ?? 0;
  }

  /// Elimina un perfil y todas sus mediciones en transacción atómica.
  Future<int> deleteProfileCascade(String profileId) async {
    final db = await database;
    return db.transaction((txn) async {
      final deletedReadings = await txn.delete(
        'readings',
        where: 'profile_id = ?',
        whereArgs: [profileId],
      );
      await txn.delete(
        'profiles',
        where: 'id = ?',
        whereArgs: [profileId],
      );
      return deletedReadings;
    });
  }

  // -------------------------
  // MEDICIONES (Aisladas por perfil)
  // -------------------------

  Future<List<GlucoseReading>> getReadingsForProfile(String profileId) async {
    final db = await database;
    final rows = await db.query(
      'readings',
      where: 'profile_id = ?',
      whereArgs: [profileId],
      orderBy: 'timestamp_ms DESC',
    );
    return rows.map(GlucoseReading.fromDbMap).toList();
  }

  Future<GlucoseReading> insertReading(GlucoseReading reading) async {
    final db = await database;
    await db.insert(
      'readings',
      reading.toDbMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
    return reading;
  }

  /// Evita guardar duplicados en la misma ventana de 1 minuto con igual valor y perfil.
  Future<bool> insertReadingIfNotDuplicate(GlucoseReading candidate) async {
    final db = await database;
    final minTs = candidate.timestampMs - 59999;
    final maxTs = candidate.timestampMs + 59999;

    final existing = await db.query(
      'readings',
      columns: ['id'],
      where: 'profile_id = ? AND value_mg_dl = ? AND timestamp_ms BETWEEN ? AND ?',
      whereArgs: [candidate.profileId, candidate.valueMgDl, minTs, maxTs],
      limit: 1,
    );

    if (existing.isNotEmpty) {
      return false;
    }
    await db.insert('readings', candidate.toDbMap());
    return true;
  }

  Future<void> deleteReading(String readingId) async {
    final db = await database;
    await db.delete(
      'readings',
      where: 'id = ?',
      whereArgs: [readingId],
    );
  }
}
