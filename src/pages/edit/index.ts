// @author 吴志强
// @date 2021/9/21

import {compose, lifecycle, pure, withState, withHandlers} from 'recompose';
import EditView from '@/pages/edit/edit-view';
import withDva from '@/components/with-dva';
import {createSelector} from 'reselect';
import {GET_ENVIRONMENT_VARIABLE, UPDATE_ENVIRONMENT_VARIABLE} from '@/actions/actionTypes';
import {getEnvironmentVariable, updateEnvironmentVariable} from '@/actions/actions';
import {message} from 'antd';

interface IProps {
    dispatch: Function;
    history: any;
}

const onOk = (props: IProps) => (environmentVariable: EnvironmentVariable) => {
    if (environmentVariable.key.toUpperCase().trim() === 'PATH') {
        message.warn('key不能为Path');
        return;
    }
    if (environmentVariable.key.toUpperCase().trim() === 'PATHEXT') {
        message.warn('key不能为PATHEXT');
        return;
    }
    const {dispatch, history} = props;
    dispatch(updateEnvironmentVariable(environmentVariable)).then((result: Result) => {
        if (result.code === 200) {
            history.push('/home');
        } else {
            message.warn(result.message);
        }
    });
};

const withLifecycle = lifecycle({
    componentDidMount() {
        const {dispatch, location, setValue}: any = this.props;
        dispatch(getEnvironmentVariable(location.params.id)).then((result: Result) => {
            if (result.code === 200) {
                setValue(result.data.environmentVariable);
            } else {
                message.warn(result.message);
            }
        });
    },
});

const selector = createSelector((state: any) => ({
    loadings: state.loading.effects,
}), ({loadings}) => ({
    getLoading: loadings[GET_ENVIRONMENT_VARIABLE] === true,
    updateLoading: loadings[UPDATE_ENVIRONMENT_VARIABLE] === true,
}));

const mapStateToProps = (state) => selector(state);

export default compose(
    pure,
    withDva(mapStateToProps),
    withState('value', 'setValue', null),
    withHandlers({onOk}),
    withLifecycle,
)(EditView);
