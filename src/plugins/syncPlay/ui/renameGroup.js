import globalize from '../../../lib/globalize';
import toast from '../../../components/toast/toast';
import prompt from '../../../components/prompt/prompt';

/**
 * Asks for a new name for the current group and applies it.
 * @param {Object} manager The SyncPlay manager.
 * @returns {Promise} A Promise fulfilled when done.
 */
export default function renameGroup(manager) {
    return prompt({
        title: globalize.translate('LabelSyncPlayRenameGroup'),
        label: globalize.translate('LabelSyncPlayGroupName'),
        value: manager.getGroupInfo()?.GroupName ?? ''
    }).then((groupName) => {
        const name = groupName?.trim();
        if (!name) return;

        return manager.renameGroup(name).catch((error) => {
            console.error('SyncPlay: failed to rename group:', error);
            toast(globalize.translate('MessageSyncPlayRenameFailed'));
        });
    }).catch(() => {
        // The dialog has been dismissed.
    });
}
