import { createRouter, createWebHashHistory } from 'vue-router'
import LibraryView from '@/views/LibraryView.vue'

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        {
            path: '/',
            name: 'library',
            component: LibraryView,
        },
        {
            path: '/fiction/:fictionDbId/chapters',
            name: 'chapter-list',
            component: () => import('@/views/ChapterListView.vue'),
            props: route => ({ fictionDbId: Number(route.params.fictionDbId) }),
        },
        {
            path: '/fiction/:fictionDbId/read/:chapterId',
            name: 'reader',
            component: () => import('@/views/ReaderView.vue'),
            props: route => ({
                fictionDbId: Number(route.params.fictionDbId),
                chapterId: route.params.chapterId as string,
            }),
        },
        {
            path: '/settings',
            name: 'settings',
            component: () => import('@/views/SettingsView.vue'),
        },
    ],
})

export default router
