// @author 吴志强
// @date 2022/1/14

import {Map} from 'immutable';
import {
    listHosts,
    setHost,
    deleteHost,
    openHostsFile,
    writeHostsFile,
    readHostsFile,
    insertHost,
} from '@/services/hostsService';

export default {
    namespace: 'hostModel',
    state: Map({}),
    effects: {
        * listHosts({payload}, {call}) {
            return yield call(listHosts, payload);
        },
        * setHost({payload}, {call}) {
            return yield call(setHost, payload);
        },
        * deleteHost({payload}, {call}) {
            return yield call(deleteHost, payload);
        },
        * openHostsFile({payload}, {call}) {
            return yield call(openHostsFile, payload);
        },
        * readHostsFile({payload}, {call}) {
            return yield call(readHostsFile, payload);
        },
        * writeHostsFile({payload}, {call}) {
            return yield call(writeHostsFile, payload);
        },
        * insertHost({payload}, {call}) {
            return yield call(insertHost, payload);
        },
    },
};
