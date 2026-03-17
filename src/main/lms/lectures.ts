/**
 * 강의 상세 스크래핑.
 * Python core의 src/scraper/course_scraper.py fetch_lectures + _parse_weeks + _parse_item 포팅.
 */

import { BrowserWindow } from 'electron'
import {
  Course,
  CourseDetail,
  LectureItem,
  TYPE_CLASS_MAP,
  Week,
  createCourseDetail,
  createLectureItem,
  createWeek
} from './types'
import { ensureLoggedIn } from './auth'
import { waitForSelector } from './utils'

/**
 * 과목의 주차별 강의 목록을 스크래핑한다.
 */
export async function fetchLectures(
  win: BrowserWindow,
  course: Course,
  username: string,
  password: string
): Promise<CourseDetail> {
  const wc = win.webContents

  await win.loadURL(course.lecturesUrl)

  // 세션 만료 시 재로그인
  if (wc.getURL().includes('login')) {
    await ensureLoggedIn(win, username, password)
    await win.loadURL(course.lecturesUrl)
  }

  // iframe#tool_content 로드 대기
  await waitForSelector(wc, 'iframe#tool_content', 15000)

  // iframe 내부의 #root 대기 + 데이터 추출
  // Electron에서는 mainFrame.frames를 통해 iframe에 접근
  const result = await wc.executeJavaScript(`
    (async function() {
      var iframe = document.querySelector('iframe#tool_content');
      if (!iframe || !iframe.contentDocument) return null;
      var doc = iframe.contentDocument;

      // #root 대기 (최대 15초)
      for (var i = 0; i < 30; i++) {
        if (doc.querySelector('#root')) break;
        await new Promise(r => setTimeout(r, 500));
      }

      var root = doc.querySelector('#root');
      if (!root) return null;

      var courseName = root.getAttribute('data-course_name') || '';
      var professors = root.getAttribute('data-professors') || '';

      // 모두 펼치기 버튼 클릭
      var expandBtn = doc.querySelector('.xnmb-all_fold-btn');
      if (expandBtn && expandBtn.textContent && expandBtn.textContent.includes('펼치기')) {
        expandBtn.click();
        await new Promise(r => setTimeout(r, 500));
      }

      // 주차 파싱
      var moduleList = doc.querySelector('.xnmb-module-list');
      if (!moduleList) return { courseName, professors, weeks: [] };

      var topDivs = moduleList.querySelectorAll(':scope > div');
      var weeks = [];

      topDivs.forEach(function(div, idx) {
        var header = div.querySelector('.xnmb-module-outer-wrapper');
        if (!header) return;

        var titleEl = header.querySelector('.xnmb-module-title');
        var title = titleEl ? titleEl.textContent.trim() : '';
        var weekNum = idx + 1;
        var match = title.match(/(\\d+)주차/);
        if (match) weekNum = parseInt(match[1]);

        var items = div.querySelectorAll('.xnmb-module_item-outer-wrapper');
        var lectures = [];

        items.forEach(function(itemEl) {
          var lec = parseItem(itemEl);
          if (lec) lectures.push(lec);
        });

        weeks.push({ title, weekNumber: weekNum, lectures });
      });

      return { courseName, professors, weeks };

      function parseItem(el) {
        // 타입 감지
        var iconEl = el.querySelector('i.xnmb-module_item-icon');
        var lectureType = 'other';
        if (iconEl) {
          var classes = (iconEl.getAttribute('class') || '').split(/\\s+/);
          var typeMap = ${JSON.stringify(TYPE_CLASS_MAP)};
          for (var cls of classes) {
            if (typeMap[cls]) { lectureType = typeMap[cls]; break; }
          }
        }

        // 제목 + URL
        var titleEl = el.querySelector('a.xnmb-module_item-left-title');
        var title = '', itemUrl = '';
        if (titleEl) {
          title = (titleEl.textContent || '').trim();
          itemUrl = titleEl.getAttribute('href') || '';
          if (itemUrl.includes('?')) itemUrl = itemUrl.split('?')[0];
        } else {
          var altTitle = el.querySelector('.xnmb-module_item-left-title');
          if (altTitle) title = (altTitle.textContent || '').trim();
        }
        if (!title) return null;

        // duration
        var duration = null;
        var periodsEl = el.querySelector('[class*="lecture_periods"]');
        if (periodsEl) {
          var spans = periodsEl.querySelectorAll('span');
          for (var i = spans.length - 1; i >= 0; i--) {
            var text = (spans[i].textContent || '').trim();
            if (/^\\d+:\\d+$/.test(text)) { duration = text; break; }
          }
        }

        // 주차/차시 레이블
        var weekLabel = '', lessonLabel = '';
        var weekSpan = el.querySelector('[class*="lesson_periods-week"]');
        if (weekSpan) weekLabel = (weekSpan.textContent || '').trim();
        var lessonSpan = el.querySelector('[class*="lesson_periods-lesson"]');
        if (lessonSpan) lessonLabel = (lessonSpan.textContent || '').trim();

        // 시작/마감 날짜
        var startDate = null, endDate = null;
        var unlockEl = el.querySelector('[class*="lecture_periods-unlock_at"] span');
        if (unlockEl) startDate = (unlockEl.textContent || '').trim() || null;
        var dueEl = el.querySelector('[class*="lecture_periods-due_at"] span');
        if (dueEl) endDate = (dueEl.textContent || '').trim() || null;

        // 출석 상태
        var attendance = 'none';
        var attEl = el.querySelector('[class*="attendance_status"]');
        if (attEl) {
          var attClasses = attEl.getAttribute('class') || '';
          ['attendance', 'late', 'absent', 'excused'].forEach(function(s) {
            if (attClasses.includes(s)) attendance = s;
          });
        }

        // 완료 상태
        var completion = 'incomplete';
        var compEl = el.querySelector('[class*="module_item-completed"]');
        if (compEl) {
          var compClasses = compEl.getAttribute('class') || '';
          if (compClasses.includes('completed') && !compClasses.includes('incomplete')) {
            completion = 'completed';
          }
        }

        // 예정 여부
        var isUpcoming = false;
        var ddayEl = el.querySelector('.xncb-component-sub-d_day');
        if (ddayEl) {
          var ddayClasses = ddayEl.getAttribute('class') || '';
          if (ddayClasses.includes('upcoming')) isUpcoming = true;
        }

        return {
          title, itemUrl, lectureType,
          weekLabel, lessonLabel, duration,
          attendance, completion, isUpcoming,
          startDate, endDate
        };
      }
    })();
  `)

  if (!result || typeof result !== 'object' || !Array.isArray(result.weeks)) {
    throw new Error('강의 목록을 파싱할 수 없습니다.')
  }

  const weeks: Week[] = result.weeks.map(
    (w: { title: string; weekNumber: number; lectures: Partial<LectureItem>[] }) =>
      createWeek(
        w.title,
        w.weekNumber,
        w.lectures.map((l: Partial<LectureItem>) => createLectureItem(l))
      )
  )

  return createCourseDetail(course, result.courseName || course.longName, result.professors || '', weeks)
}

