# React Inspector 自包含的组件与样式发布边界

React Inspector 引入 shadcn 组件源码，由 packages/react 编译并通过现有 styles.css 入口发布所需样式，使宿主项目无需配置 Tailwind。相比让宿主参与样式生成，包内构建增加了对样式隔离和弹层主题的维护责任，但保持了现有组件包的使用方式；样式作用域覆盖编辑器与其弹出菜单，避免全局重置和通用工具类影响宿主页面。Vue 在 React 验收后对齐交互与视觉规范，采用适合 Vue 的组件实现。
