const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require('dotenv').config();
const cookieParser = require('cookie-parser');

const app = express();

const allowedOrigins = process.env.FRONTEND_URL

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

const PORT = process.env.PORT || 8080;

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

app.post("/articles", userAuth, async (req, res) => {
  try {
    const { title, category, content, tags } = req.body;
    if (title && category && content) {
      const { rows: newArticle } = await pool.query(
        "INSERT INTO articles (title, category, tags, content, author_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
        [title, category, tags, content, req.user.id],
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

app.put("/articles/:id", userAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows: authorId } = await pool.query('SELECT author_id FROM articles WHERE id = $1', [id]);

    if (authorId[0].author_id !== req.user.id) {
      res.status(403).json({message: '권한 없음.'});
      return;
    }

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

app.delete("/articles/:id", userAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = req.user.id;
    const { rows: authorId } = await pool.query('SELECT author_id FROM articles WHERE id = $1', [id]);

    if (authorId[0].author_id !== userId) {
      return res.json({message: '권한 없음'});
    }
  
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

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

function tokenGenerator(user) {
  const accessToken = jwt.sign({id: user.id}, process.env.ACCESS_SECRET, {expiresIn: '15m'});
  const refreshToken = jwt.sign({id: user.id}, process.env.REFRESH_SECRET, {expiresIn: '7d'})

  return { accessToken, refreshToken };
};

function userAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({message: 'Authorization 헤더가 없습니다'});
  }

  const parts = authHeader.split(' ');
  const scheme = parts[0];
  const token = parts[1];

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({message: 'Authorization 형식 오류'});
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_SECRET);
    req.user = {id: decoded.id};
    next();
  }
  catch (error) {
    return res.status(401).json({message: '유효하지 않거나 만료된 토큰'});
  }
};

app.post('/register', async (req, res) => {
  try {
    const { email, pw } = req.body;

    if (!email || !pw) {
      return res.status(400).json({message: 'email 또는 비밀번호가 입력되지 않았습니다.'})
    }

    const searchEmail = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (searchEmail.rows.length > 0) {
      res.status(409).json({message: '이미 존재하는 email입니다.'})
    }

    const hashedPw = await bcrypt.hash(pw, 10);
    const { rows : newUser } = await pool.query('INSERT INTO users (email, pw) VALUES ($1, $2) RETURNING id, email', [email, hashedPw]);

    const { accessToken, refreshToken } = tokenGenerator(newUser[0]);

    await pool.query('UPDATE users SET refreshToken = $1 WHERE id = $2', [refreshToken, newUser[0].id]);
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000
    })

    res.status(201).json({accessToken});
  }

  catch (error) {
    console.error(error);
    res.status(500).json({message: '서버 에러'});
  } 
})

app.post('/login', async (req, res) => {
  const { email, pw } = req.body;
  
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  
  const user = rows[0];
  if (!user) {
    res.status(401).json({message: '이메일 혹은 id가 잘못되었습니다.'});
    return;
  }
  
  const isMatch = await bcrypt.compare(pw, user.pw);
  if (!isMatch) {
    res.status(401).json({message: '이메일 혹은 id가 잘못되었습니다.'});
    return;
  }

  const { accessToken, refreshToken }= tokenGenerator(user)
  await pool.query('UPDATE users SET refreshToken = $1 WHERE id = $2',[refreshToken, user.id]);

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.json({accessToken});
  
});

// Access 토큰 재발급
app.post ('/token/refresh', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) {
    return res.status(401).json({message: '토큰 없음'})
  }

  const stored = await pool.query('SELECT * FROM users WHERE refreshToken = $1', [refreshToken]);

  if (!stored.rows.length) {
    return res.status(403).json({message: '유효하지 않은 토큰'})
  }

  jwt.verify(refreshToken, process.env.REFRESH_SECRET, (err,user) => {
    if (err) return res.status(403).json({message: '만료된 토큰'})    

    const accessToken = jwt.sign({id: user.id}, process.env.ACCESS_SECRET, {expiresIn:'15m'});
    res.json({accessToken}); });
});

app.post ('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);
    await pool.query('UPDATE users SET refreshToken = $1 WHERE id = $2', ['', decoded.id])
    res.clearCookie('refreshToken').json({message: "로그아웃 완료"});
  }
  catch (error) {
    console.error(error);
    res.status(500).json({message: "서버 에러"});
  }
})

app.get ('/me', userAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows } = await pool.query('SELECT id, email FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({message: '사용자를 찾을 수 없습니다.'});
    }

    return res.json({user: rows[0]});
  
  }
  catch(error) {
    console.error(error);
    res.status(500).json({message: '서버 에러'});
  }
    

})