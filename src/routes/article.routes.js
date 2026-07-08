// 게시글 관련 라우트
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const userAuth = require('../middlewares/auth.middleware');

// 글 가져오기 (카테고리별 글 조회, 전체 글 조회, 페이지별로 글 5개씩 로드 (페이지네이션))
router.get('/', async (req, res) => {
  try {
    const category = req.query.category;
    const page = Number(req.query.page) || 1;
    const sort = req.query.sort || "desc"; // 작성 시간순, 시간 역순 정렬
    const sortOrder = sort === "asc" ? "ASC" : "DESC";
    const limit = 5;
    const offset = (page - 1) * limit;

    let articlesQuery, articlesParams;
    let countQuery, countParams;

    if (category) { // 카테고리별
      // 글 조회
      articlesQuery = `SELECT * FROM articles WHERE category = $1 ORDER BY created_at ${sortOrder} LIMIT $2 OFFSET $3`;
      articlesParams = [category, limit, offset];
      // 전체 개수
      countQuery = 'SELECT COUNT(*) FROM articles WHERE category = $1';
      countParams = [category];
    } else { // 전체
      // 전체 글 조회
      articlesQuery = `SELECT * FROM articles ORDER BY created_at ${sortOrder} LIMIT $1 OFFSET $2`;
      articlesParams = [limit, offset];
      // 전체 개수
      countQuery = 'SELECT COUNT(*) FROM articles';
      countParams = [];
    }

    // 쿼리 병렬 실행
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

// 키워드 검색
router.get('/search', async (req, res) => {
  try {
    const keyword = req.query.keyword; // 쿼리스트링 키워드 추출
    if (!keyword) {
      return res.status(400).json({message: "검색어를 입력해주세요."});
    }

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

// 특정 글 조회
router.get('/:id', async (req, res) => { 
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({message: "잘못된 ID 형식입니다."})

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

// 글 작성
router.post('/', userAuth, async (req, res) => { 
    try {
        const { title, category, content, tags } = req.body;
        if (!title || !category || content) return res.status(400).json({ message: "입력값이 잘못되었습니다" });
        const { rows: newArticle } = await pool.query(
            "INSERT INTO articles (title, category, tags, content, author_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [title, category, tags, content, req.user.id],
        );
        res.status(201).json({ message: "글이 추가됐습니다.", article: newArticle[0] });
    } 
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "서버 오류" });
    }
});

// 글 수정
router.put('/:id', userAuth, async (req, res) => {
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

// 글 삭제
router.delete('/:id', userAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const userId = req.user.id;
    const { rows: authorId } = await pool.query('SELECT author_id FROM articles WHERE id = $1', [id]);

    if (authorId[0].author_id !== userId) {
      return res.status(403).json({message: '권한 없음'});
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

module.exports = router;