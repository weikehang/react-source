import $ from "jquery";
import {createUnit} from "./Unit";
import {createElement} from "./Element";
import {Component} from "./Component";

let React = {
    rootIndex:0,
    render,
    createElement,
    Component
};
function render(el, root) {
    let unit = new createUnit(el);
    let markUp = unit.getMarkUp(React.rootIndex);
    $(root).html(markUp);
    //出发页面注册完成事件
    $(document).trigger("mounted");//componentDidMount
}

export default React;