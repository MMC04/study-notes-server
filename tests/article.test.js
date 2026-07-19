const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/config/database');
const { createTestUser } = require('./helpers');

beforeEach(async () => {
  await pool.query('TRUNCATE TABLE articles, users RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await pool.end();
});

// 글 읽기 테스트
describe('GET /articles', () => {
  test('글이 하나도 없으면 빈 배열과 totalPages 0을 반환한다', async () => {
    const response = await request(app).get('/articles');

    expect(response.status).toBe(200);
    expect(response.body.articles).toEqual([]);
    expect(response.body.totalPages).toBe(0);
  });

  test('글이 있으면 목록과 totalPages를 정확히 반환한다', async () => {
    const { rows: users } = await pool.query(
      "INSERT INTO users (email, pw) VALUES ('author@test.com', 'hashed') RETURNING id"
    );
    const authorId = users[0].id;

    await pool.query(
      "INSERT INTO articles (title, category, content, author_id) VALUES ($1, $2, $3, $4)",
      ['첫 번째 글', 'js', '내용입니다', authorId]
    );

    const response = await request(app).get('/articles');

    expect(response.status).toBe(200);
    expect(response.body.articles.length).toBe(1);
    expect(response.body.articles[0].title).toBe('첫 번째 글');
    expect(response.body.totalPages).toBe(1);
  });

  test('category 쿼리 파라미터로 필터링된다', async () => {
    const { rows: users } = await pool.query(
      "INSERT INTO users (email, pw) VALUES ('author@test.com', 'hashed') RETURNING id"
    );
    const authorId = users[0].id;

    await pool.query(
      "INSERT INTO articles (title, category, content, author_id) VALUES ($1, 'js', '내용', $2), ($3, 'python', '내용', $2)",
      ['JS 글', authorId, 'Python 글']
    );

    const response = await request(app).get('/articles?category=js');

    expect(response.status).toBe(200);
    expect(response.body.articles.length).toBe(1);
    expect(response.body.articles[0].category).toBe('js');
  });
});

// 글 삭제 테스트
describe('DELETE /articles/:id', () => {
  let owner, other, articleId;

  beforeEach(async () => {
    owner = await createTestUser(pool);
    other = await createTestUser(pool);

    const { rows: article } = await pool.query(
      "INSERT INTO articles (title, category, content, author_id) VALUES ($1, $2, $3, $4) RETURNING id",
      ['원본 글', 'js', '내용', owner.id]
    );
    articleId = article[0].id;
  });

  test('작성자가 아닌 유저가 삭제 시도하면 403을 반환하고 글은 삭제되지 않는다', async () => {
    const response = await request(app)
      .delete(`/articles/${articleId}`)
      .set('Authorization', `Bearer ${other.token}`);

    expect(response.status).toBe(403);

    const { rows } = await pool.query('SELECT * FROM articles WHERE id = $1', [articleId]);
    expect(rows.length).toBe(1);
  });

  test('작성자 본인이 삭제하면 200과 함께 실제로 삭제된다', async () => {
    const response = await request(app)
      .delete(`/articles/${articleId}`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(response.status).toBe(200);

    const { rows } = await pool.query('SELECT * FROM articles WHERE id = $1', [articleId]);
    expect(rows.length).toBe(0);
  });
});