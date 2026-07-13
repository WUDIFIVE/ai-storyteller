# Raw book text

把无噪声《三国演义》全文放到这里：

```bash
cp /path/to/三国演义.txt server/data/raw/sanguo.txt
npm run ingest:sanguo
```

导入脚本会按“第X回”自动切分为章节，并生成 `server/data/books/sanguo.json`。
