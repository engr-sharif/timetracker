import { lazy } from 'react'
import { createHashRouter } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { HomePage } from '@/features/home/HomePage'

const TimesheetPage = lazy(() => import('@/features/timesheet/TimesheetPage'))
const TasksPage = lazy(() => import('@/features/tasks/TasksPage'))
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage'))
const MessagesPage = lazy(() => import('@/features/messages/MessagesPage'))
const ProjectsPage = lazy(() => import('@/features/projects/ProjectsPage'))
const ProjectDetail = lazy(() => import('@/features/projects/ProjectDetail'))
const NotesPage = lazy(() => import('@/features/notes/NotesPage'))
const IdeasPage = lazy(() => import('@/features/ideas/IdeasPage'))
const BoardsPage = lazy(() => import('@/features/whiteboard/BoardsPage'))
const BoardCanvas = lazy(() => import('@/features/whiteboard/BoardCanvas'))
const FilesPage = lazy(() => import('@/features/files/FilesPage'))
const PdfStudioPage = lazy(() => import('@/features/pdf/PdfStudioPage'))
const ReaderPage = lazy(() => import('@/features/reader/ReaderPage'))
const ToolsPage = lazy(() => import('@/features/tools/ToolsPage'))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'))

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'timesheet', element: <TimesheetPage /> },
      { path: 'tasks', element: <TasksPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'messages/:channelId?', element: <MessagesPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:id', element: <ProjectDetail /> },
      { path: 'notes/:id?', element: <NotesPage /> },
      { path: 'ideas', element: <IdeasPage /> },
      { path: 'boards', element: <BoardsPage /> },
      { path: 'boards/:id', element: <BoardCanvas /> },
      { path: 'files', element: <FilesPage /> },
      { path: 'pdf/:id?', element: <PdfStudioPage /> },
      { path: 'read/:id?', element: <ReaderPage /> },
      { path: 'tools/:tool?', element: <ToolsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <HomePage /> },
    ],
  },
])
