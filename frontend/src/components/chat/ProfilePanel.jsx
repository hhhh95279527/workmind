// frontend/src/components/chat/ProfilePanel.jsx
// 用户画像面板：展示 AI 从对话中学到的用户信息
import {
  UserOutlined,
  BankOutlined,
  StarOutlined,
  AimOutlined,
  DesktopOutlined,
  SettingOutlined,
  DeleteOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { useChatStore } from '@/stores/chat.js'
import styles from './ProfilePanel.module.css'

// 单行画像项（内联子组件）
function ProfileItem({ label, value, Icon }) {
  return (
    <div className={styles['profile-row']}>
      <Icon className={styles['row-icon']} />
      <div>
        <div className={styles['row-label']}>{label}</div>
        <div className={styles['row-value']}>{value}</div>
      </div>
    </div>
  )
}

export default function ProfilePanel() {
  const profile = useChatStore((s) => s.profile)
  const loadProfile = useChatStore((s) => s.loadProfile)
  const setProfile = useChatStore((s) => s.setProfile)

  const p = profile || {}
  const isEmpty =
    !p.name && !p.dept && !p.techLevel &&
    !p.currentGoal && !p.primaryStack?.length &&
    !p.prefersShort && !p.prefersCode

  return (
    <div className={styles['profile-panel']}>
      <div className={styles['panel-header']}>
        <span className={styles['panel-title']}>用户画像</span>
        <button className={styles['btn-refresh']} onClick={loadProfile} title="刷新">
          <ReloadOutlined />
        </button>
      </div>

      <div className={styles['panel-body']}>
        {/* 画像为空时的提示 */}
        {isEmpty ? (
          <div className={styles['empty-hint']}>
            <UserOutlined className={styles['empty-icon']} />
            <div>多聊几句，AI 会自动记住你的偏好和背景</div>
          </div>
        ) : (
          /* 画像内容 */
          <div className={styles['profile-items']}>
            {p.name        && <ProfileItem label="姓名"     value={p.name}        Icon={UserOutlined} />}
            {p.dept        && <ProfileItem label="部门"     value={p.dept}        Icon={BankOutlined} />}
            {p.techLevel   && <ProfileItem label="技术水平" value={p.techLevel}   Icon={StarOutlined} />}
            {p.currentGoal && <ProfileItem label="当前目标" value={p.currentGoal} Icon={AimOutlined} />}

            {p.primaryStack?.length > 0 && (
              <div className={styles['profile-row']}>
                <DesktopOutlined className={styles['row-icon']} />
                <div>
                  <div className={styles['row-label']}>技术栈</div>
                  <div className={styles['row-tags']}>
                    {p.primaryStack.map((s) => (
                      <span key={s} className="tag tag-purple">{s}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {(p.prefersShort || p.prefersCode) && (
              <div className={styles['profile-prefs']}>
                <SettingOutlined className={styles['row-icon']} />
                <div>
                  <div className={styles['row-label']}>偏好</div>
                  <div className={styles['row-tags']}>
                    {p.prefersShort && <span className="tag tag-blue">简短回答</span>}
                    {p.prefersCode  && <span className="tag tag-green">代码示例</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 清除画像按钮 */}
        {!isEmpty && (
          <button className={styles['btn-clear']} onClick={() => setProfile({})}>
            <DeleteOutlined /> 清除记忆
          </button>
        )}
      </div>
    </div>
  )
}
