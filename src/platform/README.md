# Platform Backend (MongoDB + Node.js + Express + Mongoose)

This module provides a clean, scalable backend foundation for a Udemy-like learning platform.

## Folder Structure

```text
src/platform/
  app.js
  server.js
  README.md
  models/
    index.js
  controllers/
    authController.js
    resourceController.js
    analyticsController.js
  routes/
    index.js
    authRoutes.js
    resourceRouterFactory.js
  middleware/
    auth.js
    rbac.js
    asyncHandler.js
    validateObjectId.js
    errorHandler.js
  utils/
    jwt.js
    pagination.js
    slugify.js
    ids.js
  seed/
    sampleData.js
```

## API Base

- `GET /api/v1/health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`

All resource collections are exposed with pagination-ready CRUD:

- `GET /api/v1/<resource>?page=1&limit=20`
- `GET /api/v1/<resource>/:id`
- `POST /api/v1/<resource>`
- `PATCH /api/v1/<resource>/:id`
- `DELETE /api/v1/<resource>/:id`

## Roles

- `admin`
- `teacher`
- `editor`
- `student`

JWT auth is required for all resources.

## Indexes and Constraints

- Unique: `users.email`, `categories.slug`, `courses.slug`, `certificates.certificateId`, `payments.transactionId`, `invoices.invoiceNumber`
- Composite unique: `enrollments(studentId,courseId)`, `lessonProgress(studentId,lessonId)`, `assignmentSubmissions(assignmentId,studentId)`, `userBadges(userId,badgeId)`
- Reporting indexes: payment status/date, enrollment status/date, analytics date, course status/category/teacher

## Relationship Summary (ERD text)

- User(teacher) `1:N` Course
- Category `1:N` Course
- Course `1:N` CourseSection, Lesson, Quiz, Assignment
- Student(User) `M:N` Course via Enrollment
- Enrollment `1:N` LessonProgress (indirect via course/student)
- Quiz `1:N` QuizQuestion and QuizAttempt
- Assignment `1:N` AssignmentSubmission
- Payment `1:1` Invoice, `1:0..1` Refund, `1:0..1` InstructorEarning
- Enrollment `1:1` Certificate (after completion)
- User `1:N` Notification, PointsTransaction
- Badge `M:N` User via UserBadge
- Affiliate `1:N` AffiliateCommission

## Ready for Future Integrations

The module is structured to plug in:

- WhatsApp/email providers
- Google Analytics sync jobs
- PDF certificate generation
- Excel/PDF report export jobs
- Zoom/live-class integrations

