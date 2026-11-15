import { describe, expect, test } from "bun:test";
import { isEmptyDay, parseWeekHtml } from "./parse";

const WEEK_HTML = `
<table>
  <thead>
    <tr>
      <th>구분</th>
      <th>2026-08-17 (월)</th>
      <th>2026-08-18 (화)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th>조식</th>
      <td>
        <p class="fm_tit_p">450.0kcal</p>
        <p class="fm_img"><img src="/meal/breakfast.jpg" /></p>
        <p>흰쌀밥<br />미역국<br />&lt;간편식&gt; 샌드위치</p>
      </td>
      <td>
        <p class="fm_tit_p">0kcal</p>
        <p>상세보기</p>
      </td>
    </tr>
    <tr>
      <th>중식</th>
      <td>
        <p class="fm_tit_p">820kcal</p>
        <p>현미밥<br />김치찌개<br />&lt;셀프바&gt; 샐러드</p>
      </td>
      <td>
        <p class="fm_tit_p">700kcal</p>
        <p>잡곡밥 / 된장국</p>
      </td>
    </tr>
    <tr>
      <th>석식</th>
      <td><p>상세보기</p></td>
      <td><p>상세보기</p></td>
    </tr>
  </tbody>
</table>
`;

describe("parseWeekHtml", () => {
  test("parses dated columns and meal sections", () => {
    const week = parseWeekHtml(WEEK_HTML, "2026-08-17");

    expect(Object.keys(week)).toEqual(["2026-08-17", "2026-08-18"]);
    expect(week["2026-08-17"].breakfast.regular).toEqual(["흰쌀밥", "미역국"]);
    expect(week["2026-08-17"].breakfast.simple).toEqual(["샌드위치"]);
    expect(week["2026-08-17"].breakfast.kcal).toBe(450);
    expect(week["2026-08-17"].breakfast.image).toBe("https://dimigo-h.goeas.kr/meal/breakfast.jpg");
    expect(week["2026-08-17"].lunch.plus).toEqual(["샐러드"]);
    expect(week["2026-08-18"].lunch.regular).toEqual(["잡곡밥", "된장국"]);
    expect(isEmptyDay(week["2026-08-18"])).toBe(false);
  });

  test("falls back to Sunday-Saturday columns when headers have no dates", () => {
    const html = `
      <table>
        <thead><tr><th>구분</th><th>일</th><th>월</th></tr></thead>
        <tbody>
          <tr>
            <th>중식</th>
            <td><p>상세보기</p></td>
            <td><p>쌀밥</p></td>
          </tr>
        </tbody>
      </table>
    `;

    const week = parseWeekHtml(html, "2026-08-20");
    expect(Object.keys(week)).toHaveLength(7);
    expect(week["2026-08-16"]).toBeDefined();
    expect(week["2026-08-17"].lunch.regular).toEqual(["쌀밥"]);
    expect(isEmptyDay(week["2026-08-16"])).toBe(true);
  });
});

describe("parseWeekHtml allergy codes", () => {
  test("drops wrapped allergy numbers and keeps food names that contain digits", () => {
    const html = `
      <table>
        <thead><tr><th>구분</th><th>2026-11-14 (토)</th></tr></thead>
        <tbody>
          <tr>
            <th>중식</th>
            <td>
              <p class="fm_tit_p">895Kcal</p>
              <p class=""><뚝배기>왕갈비탕1.5.6.16<br/>칼슘강화쌀밥<br/>수제녹두빈대떡&amp;양파장5.6.9.10<br/>갈치소금구이<br/>5.6<br/>크런치미니치킨카츠<br/>2.5.6.15.16<br/>깍두기6.9.<br/>혼합잡곡밥 (5)<br/>마.계토스트1.2.5.6.10<br/>2종시리얼2.5.6.13/오트밀<br/>우유2or저지방우유2or주스12<br/>어두부전*선택)소스2종<br/>비타민C<br/><플러스바><br/>쌀밥<br/><간편식><br/>선식<br/>5.</p>
            </td>
          </tr>
        </tbody>
      </table>
    `;

    const lunch = parseWeekHtml(html, "2026-11-14")["2026-11-14"].lunch;
    expect(lunch.kcal).toBe(895);
    expect(lunch.regular).toEqual([
      "<뚝배기>왕갈비탕",
      "칼슘강화쌀밥",
      "수제녹두빈대떡&양파장",
      "갈치소금구이",
      "크런치미니치킨카츠",
      "깍두기",
      "혼합잡곡밥",
      "마.계토스트",
      "2종시리얼",
      "오트밀",
      "우유or저지방우유or주스",
      "어두부전*선택)소스2종",
      "비타민C",
    ]);
    expect(lunch.plus).toEqual(["쌀밥"]);
    expect(lunch.simple).toEqual(["선식"]);
  });
});
