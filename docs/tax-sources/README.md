# 税制資料の置き場（docs/tax-sources/）

公式資料（PDF または保存したHTML）をここに置くと、Claude Code がローカルで読んで `src/data/taxYears/*.js` に変換する。
Webアクセスに依存しない。**数値・適用条件・境界値・対象年・施行日・出典は必ずセットで登録する。**

## ファイル名の付け方
`<年分>_<項目>_<発行元>.pdf|html`　例：`2025_basic-deduction_nta.html`、`2026_nenmatsu-chosei-guide_nta.pdf`

## 集める資料（URLはGPT提案の転記。utmパラメータは除去。Claude側では未検証）
| 項目 | 入口 |
|---|---|
| 所得税の税率・速算表 | https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/2260.htm |
| 基礎控除 | https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1199.htm |
| 所得控除の一覧 | https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1100.htm |
| 特定親族特別控除 | https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1177.htm |
| 給与所得控除 | https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1410.htm |
| 住民税（所得割・均等割・森林環境税） | 総務省の個人住民税の資料＋自治体ページ（例：広島県 https://www.pref.hiroshima.lg.jp/site/zei/kojinkenmin.html ） |
| 個人事業税（事業主控除・税率・対象業種） | 都道府県の案内（例：広島県 https://www.pref.hiroshima.lg.jp/site/zei/1170306367409.html ） |
| 配偶者控除・扶養控除・障害者/寡婦/ひとり親/勤労学生控除 | 国税庁の「年末調整のしかた」等のパンフレット（年分ごと）。ここから控除関係をまとめて取れる |

## 年分・施行日の注意（GPT提案の指摘。内容は未検証）
- 2025年分・2026年分・2027年分以後で控除額が異なる項目がある、との指摘あり。年分ごとに別データにする。
- 2026年中に施行日が分かれる改正がある、との指摘あり。年末調整と確定申告で適用関係が違う可能性があるため、公式資料で確認できるまで登録しない。
