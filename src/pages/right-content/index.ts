// @author 吴志强
// @date 2021/10/6

import {compose, pure, withHandlers} from 'recompose';
import RightContentView from '@/pages/right-content/right-content-view';
import toFunction from '@/components/to-function';
import withMain from '@/components/with-main';
import {ProgressInfo} from 'electron-updater';
import {message} from 'antd';
import withDva from '@/components/with-dva';
import {createSelector} from 'reselect';
import {updateUpdateModel, quitAndInstall} from '@/actions/actions';
import lodash from 'lodash';

interface IProps {
    progressVisible: boolean;
    dispatch: Function;
}

const onUpdate = ({dispatch}: IProps) => () => {
    dispatch(quitAndInstall());
};

const updateDownloadProgress = ({dispatch}: IProps) => (event, progress: ProgressInfo) => {
    dispatch(updateUpdateModel({
        progressPercent: lodash.round(progress.percent),
    }));
};

const updateError = ({progressVisible, dispatch}: IProps) => (event, err: Error) => {
    message.warn(err.message);
    if (progressVisible) {
        dispatch(updateUpdateModel({
            progressStatus: 'exception',
        }));
    }
};

const updateDownloaded = ({dispatch}: IProps) => () => {
    message.info('下载完毕');
    dispatch(updateUpdateModel({
        progressStatus: 'success',
        progressPercent: 100,
        updateButtonVisible: true,
    }));
};

const mapPropsToComponent = (props) => {
    return {
        progressWidth: props.headerHeight - 13,
    };
};

const selector = createSelector((state: any) => ({
    updateModel: state.updateModel,
}), ({updateModel}) => ({
    progressVisible: updateModel.progressVisible,
    progressPercent: updateModel.progressPercent,
    progressStatus: updateModel.progressStatus,
    updateButtonVisible: updateModel.updateButtonVisible,
}));

const mapStateToProps = (state) => selector(state);

export default toFunction(compose(
    withDva(mapStateToProps),
    withHandlers({onUpdate}),
    withMain('updateDownloadProgress', updateDownloadProgress),
    withMain('updateError', updateError),
    withMain('updateDownloaded', updateDownloaded),
    pure,
)(RightContentView), mapPropsToComponent);
