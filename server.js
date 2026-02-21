const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require('dotenv').config();

const app = express();

const allowedOrigins = process.env.FRONTEND_URL

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());

const PORT = process.env.PORT

app.listen(PORT, () => {
  console.log(`서버 실행중: ${PORT}`);
});

const pool = new Pool({
connectionString: process.env.DATABASE_URL,
ssl: process.env.NODE_ENV === 'production'
? {rejectUnauthorized: false}
: false
});

app.get('/', (req, res) => {
  res.json({message: 'Study Notes API'})
});

app.get("/articles", async (req, res) => {
  try {
    const category = req.query.category;
    const page = Number(req.query.page) || 1;
    const sort = req.query.sort || "desc";
    const sortOrder = sort === "asc" ? "ASC" : "DESC";
    const limit = 5;
    const offset = (page - 1) * limit;

    let articlesQuery, articlesParams;
    let countQuery, countParams;

    if (category) {
      // 카테고리별 글 조회
      articlesQuery = `SELECT * FROM articles WHERE category = $1 ORDER BY created_at ${sortOrder} LIMIT $2 OFFSET $3`;
      articlesParams = [category, limit, offset];
      
      // 카테고리별 전체 개수
      countQuery = 'SELECT COUNT(*) FROM articles WHERE category = $1';
      countParams = [category];
    } else {
      // 전체 글 조회
      articlesQuery = `SELECT * FROM articles ORDER BY created_at ${sortOrder} LIMIT $1 OFFSET $2`;
      articlesParams = [limit, offset];
      
      // 전체 개수
      countQuery = 'SELECT COUNT(*) FROM articles';
      countParams = [];
    }

    // 두 쿼리 실행
    const [articlesResult, countResult] = await Promise.all([
      pool.query(articlesQuery, articlesParams),
      pool.query(countQuery, countParams)
    ]);

    const articles = articlesResult.rows;
    const totalCount = Number(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);

    // 결과 반환
    res.json({
      articles: articles,
      totalPages: totalPages,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "서버 오류" });
  }
});

app.get("/articles/search", async (req, res) => {
  try {
    const keyword = req.query.keyword;

    const { rows } = await pool.query(
      "SELECT * FROM articles WHERE title ILIKE $1 OR content ILIKE $1 OR EXISTS (SELECT 1 FROM unnest(tags) AS TAG WHERE TAG ILIKE $1)",
      [`%${keyword}%`],
    );

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "서버 오류" });
  }
});

app.get("/articles/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query("SELECT * FROM articles WHERE id = $1", [
      id,
    ]);
    if (rows.length > 0) {
      res.json(rows[0]);
    } else {
      res.status(404).json({ message: "없는 id입니다." });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "서버 오류" });
  }
});

app.post("/articles", async (req, res) => {
  try {
    const { title, category, content, tags } = req.body;
    if (title && category && content) {
      const { rows: newArticle } = await pool.query(
        "INSERT INTO articles (title, category, tags, content) VALUES ($1, $2, $3, $4) RETURNING *",
        [title, category, tags, content],
      );
      res.json({ message: "글이 추가됐습니다.", article: newArticle[0] });
    } else {
      res.status(400).json({ message: "입력값이 잘못되었습니다" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "서버 오류" });
  }
});

app.put("/articles/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, category, content, tags } = req.body;

    const result = await pool.query(
      "UPDATE articles SET title = $1, category = $2, content = $3, tags = $4 WHERE id = $5 RETURNING *",
      [title, category, content, tags, id],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: "없는 id입니다." });
    } else {
      res.json({ message: "수정되었습니다.", article: result.rows[0] });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "서버 오류" });
  }
});

app.delete("/articles/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await pool.query(
      "DELETE FROM articles WHERE id = $1 RETURNING *",
      [id],
    );

    if (result.rowCount === 0) {
      res.status(404).json({ message: "잘못된 id입니다" });
    } else {
      res.json({ message: "삭제되었습니다" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 카테고리 Navigation 바 생성을 위한 GET
app.get("/categories", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT DISTINCT category FROM articles");
    const categories = rows.map((row) => row.category);
    res.json(categories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "서버 오류" });
  }
});
