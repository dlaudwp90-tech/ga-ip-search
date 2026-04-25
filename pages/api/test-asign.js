// KIPRIS trademarkAsignProductSearchInfo 지정상품 API 테스트
// 사용: GET /api/test-asign?appNum=4020250200708

export default async function handler(req, res) {
  const KEY = process.env.KIPRIS_ACCESS_KEY;
  if (!KEY) {
    return res.status(500).json({ error: 'KIPRIS_ACCESS_KEY not set' });
  }

  const appNum = req.query.appNum || '4020250200708'; // 기본값: 랑이(Rang-i)

  // 엔드포인트 후보 2개 순서대로 시도
  const endpoints = [
    `https://plus.kipris.or.kr/openapi/rest/trademarkInfoSearchService/trademarkAsignProductSearchInfo?applicationNumber=${appNum}&accessKey=${encodeURIComponent(KEY)}`,
    `https://api.kipris.or.kr/rest/largest/service/trademarkInfoSearchService/trademarkAsignProductSearchInfo?applicationNumber=${appNum}&accessKey=${encodeURIComponent(KEY)}`,
  ];

  const results = [];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/xml, text/xml, */*' },
        signal: AbortSignal.timeout(8000),
      });
      const body = await response.text();

      results.push({
        endpoint: url.split('?')[0].replace('https://', ''),
        httpStatus: response.status,
        contentType: response.headers.get('content-type'),
        bodyPreview: body.substring(0, 1000),
        // 지정상품 데이터 존재 여부 판단
        hasAsignData: body.includes('asignProductInfo') || body.includes('asignProduct') || body.includes('지정'),
        resultCode: body.match(/<resultCode>([^<]+)<\/resultCode>/)?.[1] || null,
        resultMsg:  body.match(/<resultMsg>([^<]+)<\/resultMsg>/)?.[1]  || null,
        count: (body.match(/<asignProduct/g) || []).length,
      });
    } catch (e) {
      results.push({
        endpoint: url.split('?')[0].replace('https://', ''),
        error: e.message,
      });
    }
  }

  // 판단 결과 자동 요약
  const verdict = results.map(r => {
    if (r.error) return `❌ ${r.endpoint} → 연결 실패: ${r.error}`;
    if (r.hasAsignData) return `✅ ${r.endpoint} → 지정상품 데이터 확인! (${r.count}건)`;
    if (r.resultCode) return `⚠️  ${r.endpoint} → resultCode=${r.resultCode}, msg=${r.resultMsg}`;
    return `❓ ${r.endpoint} → HTTP ${r.httpStatus}, 데이터 구조 불명확`;
  });

  res.status(200).json({
    테스트출원번호: appNum,
    verdict,
    상세결과: results,
  });
}
