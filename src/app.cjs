const express = require("express");
// const { open } = require("sqlite");
const { google } = require('googleapis');
require('dotenv').config();
// const sqlite3 = require("sqlite3");
const path = require("path");
const { convertLinkToDownloadable } = require("./converter.cjs");

const app = express();
app.use(express.json());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
let credentialsJsonStr = process.env.GOOGLE_APPLICATION_CREDENTIALS;

// 環境変数が設定されているかのチェック
if (!SPREADSHEET_ID) {
  process.exit(1);
}
if (!credentialsJsonStr) {
  process.exit(1);
}

credentials = JSON.parse(credentialsJsonStr);

// const dbPromise = open({
//   filename: './src/database/charts.db',
//   driver: sqlite3.Database
// });

// Google Authクライアントの初期化
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: credentials.client_email,
    private_key: credentials.private_key,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

// Google Sheets API サービスオブジェクトの初期化
const sheets = google.sheets({ version: 'v4', auth });

let cachedSheetContents = {};
let lastCacheUpdateTime = null;
const CACHE_LIFETIME_MS = 1 * 60 * 1000;
const SHEET_NAMES_TO_CACHE = ["contents", "likes", "sqlite_sequence", "votes"];

async function loadSheetDataToCache() {
    try {
    const newCache = {};
        for (const sheetName of SHEET_NAMES_TO_CACHE) {
            const data = await getSheetData(sheetName); 
            newCache[sheetName] = data;
        }
        cachedSheetContents = newCache; // 全てのシートのロードが成功したらキャッシュを更新
        lastCacheUpdateTime = new Date();
    } catch (error) {
        // エラーが発生してもサーバーは停止させず、古いキャッシュを使うか、空のままにする
    }
}

// キャッシュが古ければ更新するミドルウェア、またはヘルパー関数
async function ensureCacheFreshness() {
    if (!lastCacheUpdateTime || (new Date() - lastCacheUpdateTime) > CACHE_LIFETIME_MS) {
        await loadSheetDataToCache();
    }
}

// (async function initializeDatabase() {
//   const db = await dbPromise;

//   await db.exec(`CREATE TABLE IF NOT EXISTS contents (
//     id INTEGER PRIMARY KEY AUTOINCREMENT,
//     contentType INTEGER NOT NULL,
//     title TEXT,
//     publisher TEXT,
//     description TEXT,
//     downloadUrl TEXT,
//     imageUrl TEXT,
//     date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//     downloadCount INTEGER DEFAULT 0,
//     voteAverageScore REAL DEFAULT 0,
//     songInfo TEXT
//   )`);

//   await db.exec(`CREATE TABLE IF NOT EXISTS votes (
//     id INTEGER PRIMARY KEY AUTOINCREMENT,
//     contentId INTEGER NOT NULL,
//     userId TEXT NOT NULL,
//     name TEXT,
//     score INTEGER,
//     comment TEXT,
//     like INTEGER DEFAULT 0,
//     date TEXT NOT NULL,
//     FOREIGN KEY(contentId) REFERENCES contents(id)
//   )`);

//   await db.exec(`CREATE TABLE IF NOT EXISTS likes (
//     userId TEXT NOT NULL,
//     voteId INTEGER NOT NULL,
//     PRIMARY KEY(userId, voteId),
//     FOREIGN KEY(voteId) REFERENCES votes(id)
//   )`);
// })();

const successMessage = { message: "Operation was successful." };

function transformContent(content) {
  return {
    id: Number(content.id),
    contentType: Number(content.contentType),
    title: content.title,
    publisher: content.publisher,
    description: content.description,
    downloadUrl: convertLinkToDownloadable(content.downloadUrl),
    imageUrl: content.imageUrl,
    date: new Date(content.date),
    downloadCount: Number(content.downloadCount),
    voteAverageScore: Number(content.voteAverageScore),
    songInfo: JSON.parse(content.songInfo || '{"difficulties":[0,0,0,0,0],"hasLua":false}')
  };
}

// スプレッドシートからデータを取得し、整形する関数
async function getSheetData(sheetName) {
  try {
    const range = `${sheetName}!A:ZZ`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: range,
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return [];
    }

    const headers = rows[0];
    const data = rows.slice(1);

    return data.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        let value = row[index] !== undefined ? row[index] : null;

        if (header === "id" || header === "contentType" || header === "downloadCount" || header === "voteAverageScore" || header === "score" || header === "like" || header === "seq") {
          value = (typeof value === 'string') ? Number(value.trim()) : Number(value);
        }
        if (header === "songInfo") {
          try {
            value = JSON.parse(value || '{"difficulties":[0,0,0,0,0],"hasLua":false}');
          } catch (jsonError) {
            value = { "difficulties": [0, 0, 0, 0, 0], "hasLua": false };
          }
        }
        if (header === "downloadUrl" && value) {
          value = convertLinkToDownloadable(value);
        }
        // date は Date オブジェクトに変換
        if (header === "date" && value) {
            // スプレッドシートから "YYYY-MM-DD" 形式の文字列が来ると仮定
            if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const parts = value.split('-');
                // ローカルタイムゾーンで日付を作成 (月は0-indexedなので -1)
                value = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
            } else {
                // その他の形式や不正な値の場合は通常のDateコンストラクタを使用
                value = new Date(value);
            }
        }
        obj[header] = value;
      });
      return obj;
    });

  } catch (error) {
    throw error;
  }
}

// スプレッドシートの特定のセルを更新するヘルパー関数
async function updateSheetCell(sheetName, rowId, headerName, newValue) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A:ZZ`,
    });
    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      console.error(`Error: Sheet "${sheetName}" is empty.`);
      return;
    }

    const headers = rows[0];
    const targetRowIndex = rows.findIndex(row => row[0] == rowId);

    if (targetRowIndex === -1) {
      console.warn(`Warning: Row with ID "${rowId}" not found in sheet "${sheetName}". Cannot update.`);
      return;
    }

    const targetColIndex = headers.indexOf(headerName);
    if (targetColIndex === -1) {
      console.warn(`Warning: Header "${headerName}" not found in sheet "${sheetName}". Cannot update.`);
      return;
    }

    const sheetRowNumber = targetRowIndex + 1;
    const sheetColLetter = String.fromCharCode(65 + targetColIndex);

    const rangeToUpdate = `${sheetName}!${sheetColLetter}${sheetRowNumber}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: rangeToUpdate,
      valueInputOption: 'RAW',
      resource: {
        values: [[newValue]],
      },
    });
    console.log(`Successfully updated sheet "${sheetName}" for ID ${rowId}, column "${headerName}" to "${newValue}".`);

  } catch (error) {
    console.error(`Error updating sheet "${sheetName}" for ID ${rowId}, column "${headerName}":`, error.message);
    throw error;
  }
}

// スプレッドシートに新しい行を追加するヘルパー関数
// rowDataは、シートのヘッダー名と一致するキーを持つオブジェクトである必要があります。
async function appendSheetRow(sheetName, rowData) {
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1:ZZ1`,
    });
    const headers = response.data.values ? response.data.values[0] : [];

    if (headers.length === 0) {
      console.error(`Error: Sheet "${sheetName}" has no headers. Cannot append row.`);
      return;
    }

    const valuesToAppend = headers.map(header => {
      let value = rowData[header];
      if (header === 'date' && value instanceof Date) {
        const year = value.getFullYear();
        const month = (value.getMonth() + 1).toString().padStart(2, '0');
        const day = value.getDate().toString().padStart(2, '0');
        value = `${year}-${month}-${day}`;
      }
      return value !== undefined ? value : '';
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!A1`,
      valueInputOption: 'RAW',
      resource: {
        values: [valuesToAppend],
      },
    });
    console.log(`Successfully appended row to sheet "${sheetName}".`);
  } catch (error) {
    console.error(`Error appending row to sheet "${sheetName}":`, error.message);
    throw error;
  }
}

// スプレッドシートの特定の行を更新するヘルパー関数
// rowId: 更新したい行のID (シートのA列の値と一致すると仮定)
// updatedFields: 更新したいフィールド名と新しい値を含むオブジェクト { fieldName: newValue, ... }
async function updateSheetRow(sheetName, rowId, updatedFields) {
    try {
        // まず、ヘッダー行を含むシートの全データを取得して、行と列の順序を特定します。
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:ZZ`, // 全範囲を読み込み
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            console.error(`Error: Sheet "${sheetName}" is empty. Cannot update row with ID ${rowId}.`);
            return;
        }

        const headers = rows[0];
        // 0行目がヘッダー、1行目からデータなので、データ行のIDが一致する行を探す
        // スプレッドシートのA列が 'id' 列であると仮定します
        const targetRowIndex = rows.findIndex(row => row[0] == rowId); // row[0]はID列、`==`で型を変換して比較

        if (targetRowIndex === -1) {
            console.warn(`Warning: Row with ID "${rowId}" not found in sheet "${sheetName}". Cannot update.`);
            return;
        }

        // 現在の行のデータをコピーし、更新したいフィールドをマージします
        const currentRowData = rows[targetRowIndex];
        const newRowData = [...currentRowData]; // 現在の行データをコピー

        // updatedFields の内容で newRowData を更新
        for (const header of headers) {
            const colIndex = headers.indexOf(header);
            if (updatedFields.hasOwnProperty(header)) {
                let valueToSet = updatedFields[header];

                // 日付フィールドの特別処理 (Dateオブジェクトからローカル日付文字列へ)
                if (header === 'date' && valueToSet instanceof Date) {
                    const year = valueToSet.getFullYear();
                    const month = (valueToSet.getMonth() + 1).toString().padStart(2, '0');
                    const day = valueToSet.getDate().toString().padStart(2, '0');
                    valueToSet = `${year}-${month}-${day}`;
                }

                newRowData[colIndex] = valueToSet !== undefined ? valueToSet : '';
            }
        }

        // Google Sheets API の範囲は1から始まるため、行に +1 する
        const sheetRowNumber = targetRowIndex + 1; // ヘッダー行を含めたスプレッドシート上の行番号

        // 更新範囲は行全体 (A列からZZ列まで)
        const rangeToUpdate = `${sheetName}!A${sheetRowNumber}:ZZ${sheetRowNumber}`;

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: rangeToUpdate,
            valueInputOption: 'RAW', // RAW: 入力された値をそのまま書き込む
            resource: {
                values: [newRowData], // 更新する行のデータ (二次元配列)
            },
        });
        console.log(`Successfully updated sheet "${sheetName}" for ID ${rowId}.`);

    } catch (error) {
        console.error(`Error updating sheet "${sheetName}" for ID ${rowId}:`, error.message);
        throw error;
    }
}

// スプレッドシートから行を削除するヘルパー関数
async function deleteSheetRow(sheetName, rowId) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${sheetName}!A:ZZ`, // 全範囲を読み込み
        });
        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            console.warn(`Warning: Sheet "${sheetName}" is empty. No row to delete with ID ${rowId}.`);
            return;
        }

        const targetRowIndex = rows.findIndex(row => row[0] == rowId); // A列のIDで検索
        if (targetRowIndex === -1) {
            console.warn(`Warning: Row with ID "${rowId}" not found in sheet "${sheetName}". Cannot delete.`);
            return;
        }

        // Google Sheets API の範囲は1から始まるため、行に +1 する
        const sheetRowNumber = targetRowIndex + 1;

        // 行を削除するリクエスト
        const requests = [{
            deleteDimension: {
                range: {
                    sheetId: (await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: 'sheets.properties' })).data.sheets.find(s => s.properties.title === sheetName).properties.sheetId,
                    dimension: 'ROWS',
                    startIndex: sheetRowNumber - 1, // APIは0-indexed
                    endIndex: sheetRowNumber // APIはexclusive end index
                }
            }
        }];

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: { requests },
        });
        console.log(`Successfully deleted row with ID ${rowId} from sheet "${sheetName}".`);

    } catch (error) {
        console.error(`Error deleting row with ID ${rowId} from sheet "${sheetName}":`, error.message);
        throw error;
    }
}

app.get("/", async (req, res) => {
  // const db = await dbPromise;
  await ensureCacheFreshness();
  
  // Get the current page from the query string, default to 1
  const page = parseInt(req.query.page) || 1;
  const itemsPerPage = 100;
  // const offset = (page - 1) * itemsPerPage;

  // Fetch the total number of contents
  // const totalContents = await db.get(`SELECT COUNT(*) AS count FROM contents`);
  // const totalPages = Math.ceil(totalContents.count / itemsPerPage);
  const allContents = cachedSheetContents.contents || []; // 'contents' シートのデータを取得
  const totalContentsCount = allContents.length;
  const totalPages = Math.ceil(totalContentsCount / itemsPerPage);
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedContents = allContents.slice(startIndex, endIndex);

  // Fetch the current page of contents
  // const contents = await db.all(`SELECT * FROM contents LIMIT ? OFFSET ?`, [itemsPerPage, offset]);
  // const list = contents.map(transformContent);
  // const contentsWithFormattedDate = list.map(content => ({
  //   ...content,
  //   date: content.date.toISOString().slice(0, 10).replace(/-/g, "/"),
  // }));

  const contentsWithFormattedDate = paginatedContents.map(content => ({
    ...content,
    // DateオブジェクトからISO文字列のY/M/D形式に変換 (getSheetDataでDateオブジェクトになっているはず)
    date: content.date instanceof Date 
          ? `${content.date.getFullYear()}/${(content.date.getMonth() + 1).toString().padStart(2, '0')}/${content.date.getDate().toString().padStart(2, '0')}`
          : content.date,
  }));

  res.render("main", {
    contents: contentsWithFormattedDate,
    currentPage: page,
    totalPages: totalPages,
    totalCount: totalContentsCount
  });
});

app.get("/support", async (req, res) => {
  res.status(200).json({
    contents: true
  });
});

app.get("/contents", async (req, res) => {
  // const db = await dbPromise;
  // const contents = await db.all(`SELECT * FROM contents`);
  await ensureCacheFreshness();
  // const contents = await getSheetData("contents");
  // const list = contents.map(c => ({
  //   id: c.id,
  //   contentType: c.contentType,
  //   title: c.title,
  //   publisher: c.publisher,
  //   date: c.date,
  //   downloadCount: c.downloadCount,
  //   voteAverageScore: c.voteAverageScore,
  //   songInfo: JSON.parse(c.songInfo || '{}'),
  //   downloadUrl: convertLinkToDownloadable(c.downloadUrl)
  // }));
  // const list = [...contents];
  const list = cachedSheetContents.contents || [];
  res.status(200).json({ contents: list });
});

app.get("/contents/:id", async (req, res) => {
  const id = req.params.id;
  // const db = await dbPromise;

  try {
    await ensureCacheFreshness();
    const allContents = cachedSheetContents.contents || [];
    const content = allContents.find(c => c.id == id);
    if (content) {
      content.downloadUrl = convertLinkToDownloadable(content.downloadUrl);
      return res.status(200).json({ contents: content });
    }
    res.status(404).json({ message: "Content not found." });
  } catch (error) {
    res.status(500).json({ message: "Failed to retrieve content." });
  }
  // const content = await db.get(`SELECT * FROM contents WHERE id = ?`, [id]);
  // if (content) {
  //   content.downloadUrl = convertLinkToDownloadable(content.downloadUrl);
  // }
  // res.status(200).json({ contents: content });
});

app.get("/contents/:id/description", async (req, res) => {
  const id = req.params.id;
  // const db = await dbPromise;

  try {
    await ensureCacheFreshness();
    const allContents = cachedSheetContents.contents || [];
    const content = allContents.find(c => c.id == id);
    if (content) {
      content.downloadUrl = convertLinkToDownloadable(content.downloadUrl);
      return res.status(200).json({ description: content.description, downloadUrl: content.downloadUrl, imageUrl: content.imageUrl });
    }
    res.status(404).json({ message: "Content description not found." });
  } catch (error) {
    res.status(500).json({ message: "Failed to retrieve description." });
  }

  // const content = await db.get(`SELECT description, downloadUrl, imageUrl FROM contents WHERE id = ?`, [id]);
  // if (content) {
  //   content.downloadUrl = convertLinkToDownloadable(content.downloadUrl);
  // }
  // res.status(200).json(content);
});

app.put("/contents/:id/downloaded", async (req, res) => {
  const id = req.params.id;
  // const db = await dbPromise;
  try {
    await loadSheetDataToCache();
    const currentContentFromCache = cachedSheetContents.contents.find(c => c.id == id);
    
    if (!currentContentFromCache) {
      return res.status(404).json({ message: "Content not found in cache." });
    }

    const currentDownloadCount = currentContentFromCache.downloadCount || 0;
    const newDownloadCount = currentDownloadCount + 1;
    await updateSheetCell("contents", Number(id), "downloadCount", newDownloadCount);
    await loadSheetDataToCache();
    // await db.run(`UPDATE contents SET downloadCount = downloadCount + 1 WHERE id = ?`, [id]);
    // const updatedContent = await db.get(`SELECT downloadCount FROM contents WHERE id = ?`, [id]);
    res.status(200).send(successMessage);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get("/votes", async (req, res) => {
  // const db = await dbPromise;
  // const votes = await db.all(`SELECT * FROM votes`);
  // res.status(200).json({ votes });
  try {
    await ensureCacheFreshness();
    const votes = cachedSheetContents.votes || [];
    res.status(200).json({ votes });
  } catch (error) {
    res.status(500).json({ message: "Failed to retrieve votes." });
  }
});

app.get("/contents/:id/vote", async (req, res) => {
  const id = req.params.id;
  // const db = await dbPromise;
  // const votes = await db.all(`SELECT * FROM votes WHERE contentId = ?`, [id]);
  // res.status(200).json({ votes });
  
  try {
    await ensureCacheFreshness();
    const allVotes = cachedSheetContents.votes || [];
    const votes = allVotes.filter(vote => vote.contentId == id);
    res.status(200).json({ votes });
  } catch (error) {
    res.status(500).json({ message: "Failed to retrieve votes for content." });
  }
});

app.post("/contents/:id/vote", async (req, res) => {
  const contentId = req.params.id;
  // const db = await dbPromise;
  try {
    await ensureCacheFreshness(); 
    const allVotes = cachedSheetContents.votes || [];
    const sqliteSequenceData = cachedSheetContents.sqlite_sequence || [];
    let nextVoteId = 1;

    const votesSeqEntry = sqliteSequenceData.find(entry => entry.name === 'votes');
    
    let currentSeq = 0;

    if (votesSeqEntry && typeof votesSeqEntry.seq === 'number' && !isNaN(votesSeqEntry.seq)) {
        currentSeq = Number(votesSeqEntry.seq);
        if (isNaN(currentSeq)) {
            currentSeq = 0; // 変換結果がNaNの場合は0にリセット
        }
      } else {
    }
    // if (allVotes.length > 0) {
      // if (typeof lastIdValue === 'number' && !isNaN(lastIdValue)) {
      //   nextVoteId = lastIdValue + 1;
      // } else if (typeof lastIdValue === 'string' && !isNaN(Number(lastIdValue))) {
      //   nextVoteId = Number(lastIdValue) + 1;
      // }
    // }

    nextVoteId = currentSeq + 1; // 計算された次のID

    const newVoteData = {
      id: nextVoteId,
      contentId: Number(contentId),
      userId: req.body.userId,
      name: req.body.name,
      score: Number(req.body.score),
      comment: req.body.comment,
      like: Number(req.body.like || 0),
      date: req.body.date ? new Date(req.body.date) : new Date()
    };

    await appendSheetRow("votes", newVoteData);

    await ensureCacheFreshness(); 
    const currentSqliteSequenceData = cachedSheetContents.sqlite_sequence || [];
    const currentVotesSeqEntry = currentSqliteSequenceData.find(entry => entry.name === 'votes');

    if (currentVotesSeqEntry) {
        // 'votes'エントリが既に存在する場合、更新
        // 'sqlite_sequence'シートでは'name'列がIDとして機能するため、rowIdに'votes'を渡す
        await updateSheetCell("sqlite_sequence", 'votes', 'seq', nextVoteId);
    } else {
        // 'votes'エントリがない場合、新しい行を追加
        const newSeqData = { name: 'votes', seq: nextVoteId };
        await appendSheetRow("sqlite_sequence", newSeqData);
    }

    await loadSheetDataToCache();

    // await db.run(`INSERT INTO votes (contentId, userId, name, score, comment, like, date) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
    //   contentId,
    //   req.body.userId,
    //   req.body.name,
    //   req.body.score,
    //   req.body.comment,
    //   req.body.like || 0,
    //   req.body.date
    // ]);
    res.status(200).send(successMessage);
    updateVoteAverageScore(contentId);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.put("/contents/:id/vote", async (req, res) => {
  const contentId = req.params.id;
  const voteId = req.body.id;
  // const db = await dbPromise;
  try {
    await loadSheetDataToCache();
    const currentVoteFromCache = cachedSheetContents.votes.find(v => v.id == voteId);

    if (!currentVoteFromCache) {
      return res.status(404).json({ message: "Vote not found." });
    }

    const updatedVoteData = {
      ...currentVoteFromCache, // 現在のデータをベースにする
      name: req.body.name,
      score: Number(req.body.score),
      comment: req.body.comment,
      like: 0,
      date: req.body.date ? new Date(req.body.date) : new Date()
    };

    await updateSheetRow("votes", Number(voteId), updatedVoteData);
    await loadSheetDataToCache();

    // await db.run(`UPDATE votes SET name = ?, score = ?, comment = ?, like = 0, date = ? WHERE id = ? AND userId = ?`, [
    //   req.body.name,
    //   req.body.score,
    //   req.body.comment,
    //   req.body.date,
    //   voteId,
    //   req.body.userId
    // ]);
    // await db.run(`DELETE FROM likes WHERE voteId = ?`, [voteId]);
    res.status(200).send(successMessage);
    updateVoteAverageScore(contentId);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const updateVoteAverageScore = async (contentId) => {
  // const db = await dbPromise;
  // const votes = await db.all(`SELECT score FROM votes WHERE contentId = ?`, [contentId]);
  await ensureCacheFreshness();
  const allVotes = cachedSheetContents.votes || [];
  const votes = allVotes.filter(vote => vote.contentId == contentId);

  if (votes.length === 0) return;
  const total = votes.reduce((sum, v) => sum + v.score, 0);
  const averageScore = total / votes.length;
  // await db.run(`UPDATE contents SET voteAverageScore = ? WHERE id = ?`, [averageScore, contentId]);
  await updateSheetCell("contents", contentId, "voteAverageScore", averageScore);
};

app.get("/likes/:userId", async (req, res) => {
  const userId = req.params.userId;
  // const db = await dbPromise;
  // const likes = await db.all(`SELECT * FROM likes WHERE userId = ?`, [userId]);
  // res.status(200).json({ likes });
  try {
    await ensureCacheFreshness();
    const allLikes = cachedSheetContents.likes || [];
    const likes = allLikes.filter(like => like.userId == userId);
    res.status(200).json({ likes });
  } catch (error) {
    res.status(500).json({ message: "Failed to retrieve likes for user." });
  }
});

app.put("/likes/:userId", async (req, res) => {
  const voteId = req.body.voteId;
  const userId = req.params.userId;
  // const db = await dbPromise;
  try {
    const newLikeDataForSheet = {
      userId: userId,
      voteId: Number(voteId)
    };
    await appendSheetRow("likes", newLikeDataForSheet);
    await loadSheetDataToCache();
    const currentVoteFromCache = cachedSheetContents.votes.find(v => v.id == voteId);

    if (!currentVoteFromCache) {
      return res.status(404).json({ message: "Vote not found in cache." });
    }
    const currentLikeCount = currentVoteFromCache.like || 0;
    const newLikeCount = currentLikeCount + 1;

    await updateSheetCell("votes", Number(voteId), "like", newLikeCount);
    await loadSheetDataToCache();

    // await db.run(`INSERT INTO likes (userId, voteId) VALUES (?, ?)`, [userId, voteId]);
    // await db.run(`UPDATE votes SET like = like + 1 WHERE id = ?`, [voteId]);
    res.status(200).send(successMessage);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const EXPRESS_PORT = process.env.PORT || 3000;

app.listen(EXPRESS_PORT, async () => {
  await loadSheetDataToCache(); // サーバー起動時にキャッシュをロード
});