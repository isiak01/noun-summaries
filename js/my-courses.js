/**
 * My Courses page controller.
 */
import { fetchAllCourses, filterCourses } from "./courses.js";
import { userCanAccessCourse, fetchAuthorizedCoursePdfBlob } from "./payments.js";
import { downloadWatermarkedPdf } from "./watermark.js";
import { toast, setButtonLoading } from "./main.js";

function courseRowHTML(course, profile) {
  const owned = Array.isArray(profile.paid_courses) && profile.paid_courses.includes(course.code.toUpperCase());
  let statusBadge = "";
  if (course.isFree) statusBadge = `<span class="badge badge--free">Free</span>`;
  else if (profile.isPremium) statusBadge = `<span class="badge badge--premium">Premium Access</span>`;
  else if (owned) statusBadge = `<span class="badge badge--free">Purchased</span>`;
  else statusBadge = `<span class="badge badge--locked">Locked</span>`;

  const hasAccess = userCanAccessCourse(profile, course);

  return `
    <div class="card course-card">
      <div class="course-card__top">
        <span class="course-card__code">${course.code}</span>
        ${statusBadge}
      </div>
      <p class="course-card__name">${course.name}</p>
      <div class="course-card__actions row">
        ${hasAccess
          ? `<button class="btn btn--primary btn--block" data-download="${course.id}">⬇ Download PDF</button>`
          : `<a class="btn btn--outline btn--block" href="course.html?code=${encodeURIComponent(course.code)}">Unlock Course</a>`}
      </div>
    </div>`;
}

export async function renderMyCourses({ user, profile }) {
  const grid = document.getElementById("myCoursesGrid");
  const premiumBanner = document.getElementById("premiumBanner");
  const searchInput = document.getElementById("myCoursesSearch");

  if (profile?.isPremium) {
    premiumBanner.hidden = false;
    premiumBanner.innerHTML = `<div class="alert alert--success">🌟 Premium Active — All Courses Unlocked</div>`;
  } else {
    premiumBanner.hidden = true;
  }

  let allCourses = [];
  try {
    allCourses = await fetchAllCourses();
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><p>Couldn't load your courses right now.</p></div>`;
    return;
  }

  // Normal users: show only free + owned courses. Premium users: show everything.
  const relevant = profile?.isPremium
    ? allCourses
    : allCourses.filter(
        (c) => userCanAccessCourse(profile, c)
      );

  function render(list) {
    if (!list.length) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-state__icon">📖</div>
          <h3>No courses yet</h3>
          <p>You haven't unlocked any courses. Browse courses on the homepage to get started.</p>
          <a href="index.html" class="btn btn--primary">Browse Courses</a>
        </div>`;
      return;
    }
    grid.innerHTML = list.map((c) => courseRowHTML(c, profile || {})).join("");
    grid.querySelectorAll("[data-download]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const courseId = btn.dataset.download;
        const course = allCourses.find((c) => c.id === courseId);
        setButtonLoading(btn, true, "Preparing...");
        try {
          const pdfBlob = await fetchAuthorizedCoursePdfBlob(course.code);
          await downloadWatermarkedPdf(pdfBlob, user.email, `${course.code}.pdf`);
        } catch (err) {
          toast(err.message || "Could not prepare the PDF.", "error");
        }
        setButtonLoading(btn, false);
      });
    });
  }

  render(relevant);
  if (searchInput) {
    searchInput.addEventListener("input", (e) => render(filterCourses(relevant, e.target.value)));
  }
}
