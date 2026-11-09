-- 관리자 문제 가져오기에서 Word(.docx) 문제지·해답지를 저장할 수 있게 한다.
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/octet-stream',
  'application/x-hwp',
  'application/haansofthwp',
  'application/vnd.hancom.hwp',
  'application/vnd.hancom.hwpx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
  'application/x-zip-compressed'
]
where id = 'question-documents';
