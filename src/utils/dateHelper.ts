export function getWeeklyFileName(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  // 해당 월의 몇 번째 주차인지 계산 (월요일 기준)
  const firstDayOfMonth = new Date(year, date.getMonth(), 1);
  const firstDayOfWeek = firstDayOfMonth.getDay() || 7; // 일요일(0)을 7로 변환
  const offsetDate = date.getDate() + firstDayOfWeek - 1;
  const weekNumber = Math.ceil(offsetDate / 7);

  return `${year}-${month}-${day}-${weekNumber}주차.json`;
}